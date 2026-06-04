const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, filePath) {
    if (/\.(?:html|css|js)$/i.test(filePath)) {
      const type = path.extname(filePath).slice(1) === 'js' ? 'javascript' : path.extname(filePath).slice(1);
      res.setHeader('Content-Type', `text/${type}; charset=utf-8`);
    }
  },
}));

// ── ROUTES ──
app.use('/api/settings', require('./routes/settings'));
app.use('/api/movies', require('./routes/movies'));
app.use('/api/series',  require('./routes/series'));
app.use('/api/rematch', require('./routes/rematch'));
app.use('/api/tmdb',   require('./routes/tmdb'));
app.use('/api/import', require('./routes/import'));
app.use('/api/auth',   require('./routes/authLocal'));
app.use('/api/omdb',   require('./routes/omdb').router);
app.use('/api/user',   require('./routes/user'));
app.use('/stream',     require('./routes/stream'));
app.use('/upload',     require('./routes/upload'));

// Health
app.get('/api/health', (req, res) => {
  const mediaDirs = getMediaDirs();
  res.json({ status: 'ok', media_dirs: mediaDirs });
});

// Config
app.get('/api/config', (req, res) => {
  res.json({
    google_client_id: process.env.GOOGLE_CLIENT_ID || null,
    admin_email: process.env.ADMIN_EMAIL || null,
    media_dirs: getMediaDirs(),
  });
});

// Admin access check — returns 200 only if email matches ADMIN_EMAIL
app.get('/api/admin/check', (req, res) => {
  const email = req.headers['x-user-email'];
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return res.json({ allowed: true }); // no restriction set
  if (email === adminEmail) return res.json({ allowed: true });
  res.status(403).json({ allowed: false, error: 'Acceso denegado' });
});

function getMediaDirs() {
  return (process.env.MEDIA_DIRS || process.env.MEDIA_DIR || '/media')
    .split(',').map(d => d.trim()).filter(Boolean);
}

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎬 LupeFlix — puerto ${PORT}`);
  console.log(`📁 Media: ${process.env.MEDIA_DIRS || '/media'}`);
  console.log(`🔑 Admin token: ${process.env.ADMIN_TOKEN ? '✓' : '✗'}`);
  console.log(`👤 Admin email: ${process.env.ADMIN_EMAIL || 'sin restricción'}`);
  console.log(`🔐 Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? '✓' : '—'}\n`);
});
