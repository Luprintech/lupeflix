const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const fetch   = require('node-fetch');
const db      = require('../db');

// ── helpers ──────────────────────────────────────────────────────────────────

function getMovie(id) {
  return db.prepare('SELECT * FROM movies WHERE id = ?').get(id);
}

/** Common subtitle extensions and how they map to a format. */
const SUB_EXTS = {
  '.vtt': 'vtt',
  '.srt': 'srt',
  '.ass': 'ass',
  '.ssa': 'ass',
};

/** Language codes we try to detect from filenames. */
const LANG_PATTERNS = [
  { re: /\b(es|esp|spa|español|spanish|castellano)\b/i, lang: 'es', label: 'Español' },
  { re: /\b(es[-_]?la|lat|latino)\b/i,                  lang: 'es-LA', label: 'Español Latino' },
  { re: /\b(en|eng|english)\b/i,                        lang: 'en', label: 'English' },
  { re: /\b(fr|fra|french|français)\b/i,                lang: 'fr', label: 'Français' },
  { re: /\b(de|deu|ger|german|deutsch)\b/i,             lang: 'de', label: 'Deutsch' },
  { re: /\b(it|ita|italian|italiano)\b/i,               lang: 'it', label: 'Italiano' },
  { re: /\b(pt|por|portuguese|português)\b/i,           lang: 'pt', label: 'Português' },
  { re: /\b(ja|jpn|japanese|japonés)\b/i,               lang: 'ja', label: '日本語' },
];

function detectLang(filename) {
  const stem = path.basename(filename, path.extname(filename)).toLowerCase();
  for (const { re, lang, label } of LANG_PATTERNS) {
    if (re.test(stem)) return { lang, label };
  }
  return { lang: 'und', label: 'Desconocido' };
}

function isPathSafe(filePath) {
  const mediaDirs = (process.env.MEDIA_DIRS || process.env.MEDIA_DIR || '/media')
    .split(',').map(d => path.resolve(d.trim())).filter(Boolean);
  const resolved = path.resolve(filePath);
  return mediaDirs.some(d => resolved.startsWith(d + path.sep) || resolved.startsWith(d));
}

// ── SRT / ASS → VTT conversion ────────────────────────────────────────────────

function srtToVtt(srt) {
  const lines = srt
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  let vtt = 'WEBVTT\n\n';
  let i = 0;

  while (i < lines.length) {
    // Skip blank lines
    if (!lines[i]?.trim()) { i++; continue; }
    // Skip sequence number (pure integer line)
    if (/^\d+$/.test(lines[i]?.trim())) i++;
    // Timestamp line
    if (lines[i] && lines[i].includes('-->')) {
      const ts = lines[i]
        .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'); // comma → dot
      vtt += ts + '\n';
      i++;
      // Cue text lines (until blank)
      while (i < lines.length && lines[i]?.trim()) {
        vtt += lines[i] + '\n';
        i++;
      }
      vtt += '\n';
    } else {
      i++;
    }
  }

  return vtt;
}

function assToVtt(ass) {
  const lines = ass.split(/\r?\n/);
  let vtt = 'WEBVTT\n\n';

  for (const line of lines) {
    if (!line.startsWith('Dialogue:')) continue;
    const parts = line.split(',');
    if (parts.length < 10) continue;

    const t1 = parts[1]?.trim();  // start time: h:mm:ss.cc
    const t2 = parts[2]?.trim();  // end time
    const text = parts.slice(9).join(',').replace(/\{[^}]*\}/g, '').replace(/\\N/g, '\n').trim();

    if (!t1 || !t2 || !text) continue;

    const fmt = t => {
      const [h, m, sc] = t.split(':');
      const [s, cs] = (sc || '0.0').split('.');
      return `0${h}:${m.padStart(2,'0')}:${s.padStart(2,'0')}.${(cs || '0').padEnd(3,'0').slice(0,3)}`;
    };

    vtt += `${fmt(t1)} --> ${fmt(t2)}\n${text}\n\n`;
  }

  return vtt;
}

// ── ROUTES ───────────────────────────────────────────────────────────────────

/**
 * GET /api/subtitles/:id/local
 * Returns all subtitle files found next to the video file.
 */
router.get('/:id/local', (req, res) => {
  const movie = getMovie(req.params.id);
  if (!movie?.file_path) return res.json([]);

  const dir  = path.dirname(movie.file_path);
  const stem = path.basename(movie.file_path, path.extname(movie.file_path));

  if (!fs.existsSync(dir)) return res.json([]);

  const found = [];

  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const ext = path.extname(entry).toLowerCase();
      if (!SUB_EXTS[ext]) continue;

      const entryStem = path.basename(entry, ext);
      // Must share the same stem (exact or with language suffix)
      if (entryStem !== stem && !entryStem.startsWith(stem + '.') && !entryStem.startsWith(stem + '_')) continue;

      const suffix = entryStem.slice(stem.length).replace(/^[._-]/, '');
      const { lang, label } = suffix ? detectLang(suffix) : { lang: 'und', label: 'Por defecto' };
      const fullPath = path.join(dir, entry);

      found.push({
        lang,
        label,
        file: Buffer.from(fullPath).toString('base64'),
        format: SUB_EXTS[ext],
      });
    }
  } catch {
    return res.json([]);
  }

  res.json(found);
});

/**
 * GET /api/subtitles/:id/serve?file=BASE64_PATH
 * Serve a subtitle file as WebVTT (converting on the fly if needed).
 */
router.get('/:id/serve', (req, res) => {
  const encoded = req.query.file;
  if (!encoded) return res.status(400).send('file param required');

  let filePath;
  try {
    filePath = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return res.status(400).send('invalid file param');
  }

  if (!isPathSafe(filePath)) return res.status(403).send('Forbidden');
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath, 'utf8');

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (ext === '.vtt') {
    res.send(content);
  } else if (ext === '.srt') {
    res.send(srtToVtt(content));
  } else if (ext === '.ass' || ext === '.ssa') {
    res.send(assToVtt(content));
  } else {
    res.send(srtToVtt(content)); // best-effort
  }
});

/**
 * GET /api/subtitles/:id/opensubtitles?lang=es
 * Search OpenSubtitles for available subtitles.
 */
router.get('/:id/opensubtitles', async (req, res) => {
  if (!process.env.OPENSUBTITLES_KEY) {
    return res.json({
      available: false,
      message: 'Añade OPENSUBTITLES_KEY en el .env del NAS para buscar subtítulos online.',
    });
  }

  const movie = getMovie(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });

  const lang = String(req.query.lang || 'es');

  try {
    const params = new URLSearchParams({ languages: lang });
    if (movie.tmdb_id) params.set('tmdb_id', String(movie.tmdb_id));
    else params.set('query', movie.series_title || movie.title || '');

    const r = await fetch(`https://api.opensubtitles.com/api/v1/subtitles?${params}`, {
      headers: {
        'Api-Key': process.env.OPENSUBTITLES_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    const results = (data.data || []).slice(0, 12).map(item => ({
      file_id:        item.attributes?.files?.[0]?.file_id ?? null,
      language:       item.attributes?.language ?? lang,
      filename:       item.attributes?.files?.[0]?.file_name ?? '',
      download_count: item.attributes?.download_count ?? 0,
      upload_date:    item.attributes?.upload_date ?? '',
      hearing_impaired: item.attributes?.hearing_impaired ?? false,
    }));

    res.json({ available: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/subtitles/:id/download
 * Download a subtitle from OpenSubtitles and return it as VTT.
 * Body: { file_id: number }
 */
router.post('/:id/download', async (req, res) => {
  if (!process.env.OPENSUBTITLES_KEY) {
    return res.status(400).json({ error: 'OPENSUBTITLES_KEY not configured' });
  }

  const { file_id } = req.body || {};
  if (!file_id) return res.status(400).json({ error: 'file_id required' });

  try {
    // Step 1: get the download link
    const linkRes = await fetch('https://api.opensubtitles.com/api/v1/download', {
      method: 'POST',
      headers: {
        'Api-Key': process.env.OPENSUBTITLES_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id }),
    });

    if (!linkRes.ok) {
      const txt = await linkRes.text();
      return res.status(linkRes.status).json({ error: txt });
    }

    const { link, file_name } = await linkRes.json();

    // Step 2: download the actual file
    const fileRes = await fetch(link);
    const rawText = await fileRes.text();

    const ext = path.extname(file_name || '.srt').toLowerCase();
    let vttContent;
    if (ext === '.vtt') {
      vttContent = rawText;
    } else if (ext === '.ass' || ext === '.ssa') {
      vttContent = assToVtt(rawText);
    } else {
      vttContent = srtToVtt(rawText);
    }

    // Try to save next to the video file (may fail if read-only)
    const movie = getMovie(req.params.id);
    if (movie?.file_path) {
      try {
        const stem = path.basename(movie.file_path, path.extname(movie.file_path));
        const dir  = path.dirname(movie.file_path);
        const lang = req.body.lang || 'und';
        const savePath = path.join(dir, `${stem}.${lang}.srt`);
        fs.writeFileSync(savePath, rawText, 'utf8');
      } catch { /* read-only fs — skip */ }
    }

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Subtitle-Filename', file_name || 'subtitle.vtt');
    res.send(vttContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
