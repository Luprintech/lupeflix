const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const Busboy = require('busboy');

// Upload always goes to the first writable media dir or a configured upload dir
const MEDIA_DIR = (process.env.MEDIA_DIRS || process.env.MEDIA_DIR || '/media').split(',')[0].trim();
const ADMIN_TOKEN = () => process.env.ADMIN_TOKEN;

router.post('/', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN()) return res.status(401).json({ error: 'Unauthorized' });

  const subfolder = req.query.folder || 'uploads';
  const destDir = path.join(MEDIA_DIR, subfolder);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 * 1024 } });
  let savedPath = null;
  let fileName = null;

  bb.on('file', (name, stream, info) => {
    fileName = info.filename;
    const dest = path.join(destDir, fileName);
    savedPath = path.relative(MEDIA_DIR, dest);
    const writeStream = fs.createWriteStream(dest);
    stream.pipe(writeStream);

    writeStream.on('error', () => res.status(500).json({ error: 'Write error' }));
  });

  bb.on('finish', () => {
    if (savedPath) {
      res.json({ ok: true, file_path: savedPath, file_name: fileName });
    } else {
      res.status(400).json({ error: 'No file received' });
    }
  });

  req.pipe(bb);
});

// Progress-aware chunked upload
router.post('/chunk', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== ADMIN_TOKEN()) return res.status(401).json({ error: 'Unauthorized' });

  const { filename, chunkIndex, totalChunks, folder = 'uploads' } = req.query;
  if (!filename) return res.status(400).json({ error: 'filename required' });

  const destDir = path.join(MEDIA_DIR, folder);
  const tmpDir = path.join(MEDIA_DIR, '.tmp_chunks');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const chunkPath = path.join(tmpDir, `${filename}.part${chunkIndex}`);
  const writeStream = fs.createWriteStream(chunkPath);
  req.pipe(writeStream);

  writeStream.on('finish', () => {
    const idx = Number(chunkIndex);
    const total = Number(totalChunks);

    if (idx === total - 1) {
      // Assemble all chunks
      const finalPath = path.join(destDir, filename);
      const writeAll = fs.createWriteStream(finalPath);

      (async () => {
        for (let i = 0; i < total; i++) {
          const part = path.join(tmpDir, `${filename}.part${i}`);
          await new Promise((resolve, reject) => {
            const rs = fs.createReadStream(part);
            rs.pipe(writeAll, { end: false });
            rs.on('end', resolve);
            rs.on('error', reject);
          });
          fs.unlinkSync(part);
        }
        writeAll.end();
        const relativePath = path.relative(MEDIA_DIR, finalPath);
        res.json({ ok: true, file_path: relativePath, assembled: true });
      })().catch(() => res.status(500).json({ error: 'Assembly failed' }));
    } else {
      res.json({ ok: true, chunk: idx });
    }
  });

  writeStream.on('error', () => res.status(500).json({ error: 'Chunk write error' }));
});

module.exports = router;
