const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const db = require('../db');

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];

// Parse MEDIA_DIRS env: comma-separated list, fallback to MEDIA_DIR, fallback to /media
function getMediaDirs() {
  if (process.env.MEDIA_DIRS) {
    return process.env.MEDIA_DIRS.split(',').map(d => d.trim()).filter(Boolean);
  }
  return [process.env.MEDIA_DIR || '/media'];
}

// Detect type based on directory name
function detectType(dirPath) {
  const lower = dirPath.toLowerCase();
  if (lower.includes('serie'))       return 'tv';
  if (lower.includes('documental'))  return 'documentary';
  return 'movie';
}

// ── AUDIO TRACKS ──
router.get('/:id/audio-tracks', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie?.file_path || !fs.existsSync(movie.file_path)) return res.json([]);

  try {
    const raw = execSync(
      `ffprobe -v quiet -print_format json -show_streams -select_streams a "${movie.file_path.replace(/"/g, '\\"')}"`,
      { timeout: 8000 }
    ).toString();
    const streams = JSON.parse(raw).streams || [];
    if (streams.length <= 1) return res.json([]);

    const tracks = streams.map((s, i) => ({
      index: i,
      language: s.tags?.language || 'und',
      label: s.tags?.title || langLabel(s.tags?.language) || `Audio ${i + 1}`,
      codec: s.codec_name,
      channels: s.channels,
    }));
    res.json(tracks);
  } catch {
    res.json([]);
  }
});

function langLabel(code) {
  const MAP = { spa: 'Español', eng: 'English', jpn: '日本語', fre: 'Français', ger: 'Deutsch', ita: 'Italiano', por: 'Português', lat: 'Español Latino', es: 'Español', en: 'English' };
  return MAP[code] || null;
}

// ── STREAM ──
router.get('/:id', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie || !movie.file_path) return res.status(404).send('Not found');

  const filePath = movie.file_path;
  if (!fs.existsSync(filePath)) return res.status(404).send('File not found on disk');

  // Audio track selection via ffmpeg
  if (req.query.audio !== undefined) {
    const audioIndex = Math.max(0, parseInt(req.query.audio, 10) || 0);
    const startTime  = Math.max(0, parseFloat(req.query.t   || '0'));
    const ff = spawn('ffmpeg', [
      '-ss', String(startTime),
      '-i', filePath,
      '-map', '0:v:0',
      '-map', `0:a:${audioIndex}`,
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '192k',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1',
    ]);
    res.setHeader('Content-Type', 'video/mp4');
    ff.stdout.pipe(res);
    ff.stderr.on('data', () => {});
    ff.on('error', () => res.end());
    req.on('close', () => { try { ff.kill('SIGKILL'); } catch {} });
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes = {
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
    '.webm': 'video/webm', '.m4v': 'video/mp4'
  };
  const contentType = mimeTypes[ext] || 'video/mp4';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 10 * 1024 * 1024, fileSize - 1);
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

// ── SCAN ──
router.get('/scan/files', requireAdmin, (req, res) => {
  const mediaDirs = getMediaDirs();
  const requestedDir = req.query.dir; // optional: scan specific dir only

  const dirsToScan = requestedDir
    ? mediaDirs.filter(d => d === requestedDir || path.basename(d) === requestedDir)
    : mediaDirs;

  if (!dirsToScan.length) {
    return res.status(404).json({ error: 'No media directories configured', configured: mediaDirs });
  }

  const results = [];

  for (const mediaDir of dirsToScan) {
    if (!fs.existsSync(mediaDir)) {
      results.push({ dir: mediaDir, error: 'Directory not found', files: [] });
      continue;
    }
    const files = [];
    scanDir(mediaDir, mediaDir, files, detectType(mediaDir));
    results.push({ dir: mediaDir, type: detectType(mediaDir), files });
  }

  // Flat list for convenience
  const allFiles = results.flatMap(r => r.files || []);

  res.json({
    dirs: results,
    total: allFiles.length,
    media_dirs: mediaDirs,
  });
});

function scanDir(dir, baseDir, results, autoType) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath, baseDir, results, autoType);
      } else if (VIDEO_EXTS.includes(path.extname(entry.name).toLowerCase())) {
        const stat = fs.statSync(fullPath);
        const existing = db.prepare('SELECT id, title FROM movies WHERE file_path = ?').get(fullPath);
        results.push({
          name: entry.name,
          path: fullPath,           // absolute path — stored in DB
          display_path: path.relative(baseDir, fullPath),
          folder: path.relative(baseDir, dir) || '.',
          size: stat.size,
          auto_type: autoType,
          already_added: !!existing,
          existing_title: existing?.title || null,
        });
      }
    }
  } catch {}
}

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

module.exports = router;
