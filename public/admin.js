const ADMIN_KEY   = 'lupeflix_admin';
const SESSION_KEY = 'lupeflix_session';
let adminToken = localStorage.getItem(ADMIN_KEY) || '';

// ── ADMIN EMAIL RESTRICTION ──
async function checkAdminAccess() {
  const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (!session) return false;
  try {
    const r = await fetch('/api/admin/check', { headers: { 'x-user-email': session.email } });
    const d = await r.json();
    return d.allowed;
  } catch { return true; } // if endpoint fails, allow (no restriction configured)
}

// ── TOKEN AUTH ──
async function verifyToken(token) {
  try {
    const r = await fetch('/api/movies?limit=1', { headers: { 'x-admin-token': token } });
    return r.ok;
  } catch { return false; }
}

async function init() {
  // Check email restriction first
  const allowed = await checkAdminAccess();
  if (!allowed) {
    document.getElementById('authScreen').innerHTML = `
      <div class="auth-card">
        <div class="logo">LUPEFLIX <span>ADMIN</span></div>
        <h2 style="color:#ff8080;margin-top:8px">Acceso denegado</h2>
        <p style="color:rgba(255,255,255,0.4);font-size:0.85rem;margin:12px 0">Tu cuenta no tiene permisos de administrador.</p>
        <a href="home.html" style="color:#e50914;font-size:0.9rem">← Volver a LupeFlix</a>
      </div>`;
    document.getElementById('authScreen').style.display = 'flex';
    return;
  }

  if (adminToken) {
    if (await verifyToken(adminToken)) { showAdmin(); return; }
    localStorage.removeItem(ADMIN_KEY); adminToken = '';
  }
  document.getElementById('authScreen').style.display = 'flex';
}

document.getElementById('authBtn').addEventListener('click', async () => {
  const token = document.getElementById('adminTokenInput').value.trim();
  if (!await verifyToken(token)) { document.getElementById('authError').style.display = 'block'; return; }
  adminToken = token;
  localStorage.setItem(ADMIN_KEY, token);
  showAdmin();
});
document.getElementById('adminTokenInput').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('authBtn').click(); });

function showAdmin() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = 'flex';
  loadDashboard();
}

// ── NAV ──
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const sec = item.dataset.section;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`sec-${sec}`).classList.add('active');
    if (sec === 'dashboard') loadDashboard();
    if (sec === 'library') loadLibrary();
  });
});

// ── API HELPERS ──
async function apiFetch(path, opts = {}) {
  const r = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken, ...(opts.headers || {}) },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || r.status);
  return data;
}

function imgUrl(p, size = 'w92') {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  return `https://image.tmdb.org/t/p/${size}${p}`;
}
function fmtSize(b) {
  if (!b) return '';
  if (b > 1e9) return `${(b/1e9).toFixed(1)} GB`;
  if (b > 1e6) return `${(b/1e6).toFixed(0)} MB`;
  return `${(b/1e3).toFixed(0)} KB`;
}

// ── DASHBOARD ──
async function loadDashboard() {
  try {
    const [all, movies, series, recent] = await Promise.all([
      apiFetch('/movies?limit=1'),
      apiFetch('/movies?type=movie&limit=1'),
      apiFetch('/movies?type=tv&limit=1'),
      apiFetch('/movies/recent'),
    ]);
    document.getElementById('statTotal').textContent  = all.total;
    document.getElementById('statMovies').textContent = movies.total;
    document.getElementById('statSeries').textContent = series.total;

    // Sum views
    const allMovies = await apiFetch('/movies?limit=9999');
    const views = allMovies.results.reduce((s, m) => s + (m.views || 0), 0);
    document.getElementById('statViews').textContent = views;

    renderMediaList('recentList', Array.isArray(recent) ? recent : recent.results || []);
  } catch (e) { console.error(e); }
}

// ── LIBRARY ──
let libTimer;
async function loadLibrary(search = '', type = '') {
  const p = new URLSearchParams({ limit: 200 });
  if (search) p.set('search', search);
  if (type)   p.set('type', type);
  try {
    const data = await apiFetch(`/movies?${p}`);
    renderMediaList('libraryList', data.results);
  } catch {}
}
document.getElementById('libSearch').addEventListener('input', () => {
  clearTimeout(libTimer);
  libTimer = setTimeout(() => loadLibrary(
    document.getElementById('libSearch').value,
    document.getElementById('libType').value
  ), 300);
});
document.getElementById('libType').addEventListener('change', () =>
  loadLibrary(document.getElementById('libSearch').value, document.getElementById('libType').value)
);

function escHtml(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }

function renderMediaList(id, items) {
  const el = document.getElementById(id);
  if (!items?.length) { el.innerHTML = '<p class="muted" style="padding:12px 0">Sin títulos aún.</p>'; return; }
  el.innerHTML = items.map(m => `
    <div class="media-item">
      <img class="media-poster"
        src="${imgUrl(m.poster_path) || 'https://placehold.co/44x60/16162a/444?text=?'}"
        alt="" onerror="this.src='https://placehold.co/44x60/16162a/444?text=?'" />
      <div class="media-info">
        <div class="media-title">${m.title}</div>
        <div class="media-meta">
          ${m.year ? `<span>${m.year}</span>` : ''}
          ${m.genres ? `<span>${m.genres.split(',')[0]}</span>` : ''}
          ${m.rating ? `<span>⭐ ${Number(m.rating).toFixed(1)}</span>` : ''}
          ${m.file_path ? `<span style="color:#6fcf97">✓ Archivo</span>` : '<span style="color:#ff8080">Sin archivo</span>'}
          ${m.views ? `<span>▶ ${m.views}</span>` : ''}
        </div>
      </div>
      <div class="media-badge">${m.type === 'documentary' ? 'DOC' : m.type === 'movie' ? 'FILM' : 'SERIE'}</div>
      <div class="media-actions">
        <button class="btn-icon" title="Editar" onclick="openEdit(${m.id})">✏️</button>
      </div>
    </div>`).join('');
}

// ── TMDB SEARCH ──
document.getElementById('tmdbSearchBtn').addEventListener('click', searchTMDB);
document.getElementById('tmdbQuery').addEventListener('keydown', e => { if (e.key === 'Enter') searchTMDB(); });

async function searchTMDB() {
  const q = document.getElementById('tmdbQuery').value.trim();
  const type = document.getElementById('tmdbType').value;
  if (!q) return;
  const el = document.getElementById('tmdbResults');
  el.innerHTML = '<p class="muted">Buscando...</p>';
  try {
    const data = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=${type}`).then(r => r.json());
    if (!data.results?.length) { el.innerHTML = '<p class="muted">Sin resultados.</p>'; return; }
    el.innerHTML = data.results.slice(0, 18).map(item => {
      const title = item.title || item.name;
      const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
      const poster = item.poster_path
        ? `https://image.tmdb.org/t/p/w185${item.poster_path}`
        : `https://placehold.co/130x195/16162a/444?text=${encodeURIComponent(title)}`;
      return `<div class="tmdb-card" onclick="fillFromTMDB(${item.id},'${type}')">
        <img src="${poster}" alt="${title}" />
        <div class="tmdb-card-title">${title}</div>
        <div class="tmdb-card-year">${year}</div>
      </div>`;
    }).join('');
  } catch { el.innerHTML = '<p class="muted">Error al buscar.</p>'; }
}

async function fillFromTMDB(tmdbId, type) {
  try {
    const item = await fetch(`/api/tmdb/detail/${type}/${tmdbId}`).then(r => r.json());
    const form = document.getElementById('addForm');
    form.title.value          = item.title || item.name || '';
    form.original_title.value = item.original_title || item.original_name || '';
    form.year.value           = (item.release_date || item.first_air_date || '').slice(0, 4);
    form.type.value           = type;
    form.description.value    = item.overview || '';
    form.genres.value         = item.genres?.map(g => g.name).join(', ') || '';
    form.rating.value         = item.vote_average?.toFixed(1) || '';
    form.duration.value       = item.runtime || item.episode_run_time?.[0] || '';
    form.poster_path.value    = item.poster_path || '';
    form.backdrop_path.value  = item.backdrop_path || '';
    form.tmdb_id.value        = item.id;
    if (item.poster_path) {
      document.getElementById('posterImg').src = `https://image.tmdb.org/t/p/w185${item.poster_path}`;
      document.getElementById('posterPreview').style.display = 'block';
    }
    document.getElementById('manualForm').style.display = 'block';
    document.getElementById('manualForm').scrollIntoView({ behavior: 'smooth' });
    showToast(`✓ Cargado: ${item.title || item.name}`);
  } catch { showToast('Error al cargar TMDB'); }
}

document.getElementById('clearForm').addEventListener('click', () => {
  document.getElementById('addForm').reset();
  document.getElementById('posterPreview').style.display = 'none';
  document.getElementById('manualForm').style.display = 'none';
  document.getElementById('addError').style.display = 'none';
  document.getElementById('addSuccess').style.display = 'none';
});

// ── ADD FORM ──
document.getElementById('addForm').addEventListener('submit', async e => {
  e.preventDefault();
  const body = {};
  new FormData(e.target).forEach((v, k) => { if (v) body[k] = v; });
  document.getElementById('addError').style.display = 'none';
  document.getElementById('addSuccess').style.display = 'none';
  try {
    const res = await apiFetch('/movies', { method: 'POST', body: JSON.stringify(body) });
    const s = document.getElementById('addSuccess');
    s.textContent = `✓ "${body.title}" guardada (ID: ${res.id})`;
    s.style.display = 'block';
    showToast('Título guardado');
  } catch (err) {
    const el = document.getElementById('addError');
    el.textContent = err.message; el.style.display = 'block';
  }
});

window.setFilePath = (p) => {
  document.getElementById('filePathInput').value = p;
  document.getElementById('manualForm').style.display = 'block';
};

// ── EDIT MODAL ──
let currentEditMovie = null;
async function openEdit(id, openMatcher = false) {
  try {
    const m = await apiFetch(`/movies/${id}`);
    currentEditMovie = m;
    const form = document.getElementById('editForm');
    Object.keys(m).forEach(k => { if (form.elements[k]) form.elements[k].value = m[k] ?? ''; });
    document.getElementById('deleteBtn').onclick = () => deleteMovie(id, m.title);
    document.getElementById('editOverlay').style.display = 'flex';
    document.getElementById('editMatchBox').style.display = openMatcher ? 'block' : 'none';
    document.getElementById('editMatchQuery').value = m.title || '';
    document.getElementById('editMatchType').value = m.type === 'tv' ? 'tv' : 'movie';
    document.getElementById('editMatchResults').innerHTML = '';
    if (openMatcher) searchEditMatches();
  } catch { showToast('Error al cargar'); }
}

document.getElementById('editIdentifyBtn').addEventListener('click', () => {
  if (!currentEditMovie) return;
  document.getElementById('editMatchBox').style.display = 'block';
  document.getElementById('editMatchQuery').value = currentEditMovie.title || '';
  document.getElementById('editMatchType').value = currentEditMovie.type === 'tv' ? 'tv' : 'movie';
  searchEditMatches();
});
document.getElementById('editMatchSearch').addEventListener('click', searchEditMatches);
document.getElementById('editMatchQuery').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchEditMatches(); } });

async function searchEditMatches() {
  if (!currentEditMovie) return;
  const q = document.getElementById('editMatchQuery').value.trim();
  const type = document.getElementById('editMatchType').value;
  const el = document.getElementById('editMatchResults');
  if (!q) return;
  el.innerHTML = '<p class="muted">Buscando...</p>';
  try {
    const data = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=${type}`).then(r => r.json());
    if (!data.results?.length) { el.innerHTML = '<p class="muted">Sin resultados. Prueba con el título original.</p>'; return; }
    el.innerHTML = data.results.slice(0, 12).map(item => {
      const title = item.title || item.name || '';
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const poster = item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : `https://placehold.co/130x195/16162a/444?text=${encodeURIComponent(title || '?')}`;
      return `<div class="tmdb-card" onclick="applyEditMatch(${item.id}, '${type}')"><img src="${poster}" alt="${escHtml(title)}" /><div class="tmdb-card-title">${escHtml(title)}</div><div class="tmdb-card-year">${year}</div></div>`;
    }).join('');
  } catch { el.innerHTML = '<p class="muted">Error buscando en TMDB.</p>'; }
}

async function applyEditMatch(tmdbId, type) {
  if (!currentEditMovie) return;
  const el = document.getElementById('editMatchResults');
  el.innerHTML = '<p class="muted">Aplicando metadatos...</p>';
  try {
    await apiFetch(`/rematch/${currentEditMovie.id}/identify`, {
      method: 'POST',
      body: JSON.stringify({ tmdb_id: Number(tmdbId), type }),
    });
    showToast('Metadatos actualizados');
    await openEdit(currentEditMovie.id, false);
    loadDashboard();
    loadLibrary();
  } catch (err) {
    el.innerHTML = `<p class="muted">${escHtml(err.message)}</p>`;
  }
}

document.getElementById('editClose').addEventListener('click', () => { document.getElementById('editOverlay').style.display = 'none'; });
document.getElementById('editForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id   = e.target.elements['id'].value;
  const body = {};
  new FormData(e.target).forEach((v, k) => { if (k !== 'id') body[k] = v; });
  try {
    await apiFetch(`/movies/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    document.getElementById('editOverlay').style.display = 'none';
    showToast('Cambios guardados'); loadLibrary();
  } catch (err) {
    document.getElementById('editError').textContent = err.message;
    document.getElementById('editError').style.display = 'block';
  }
});
async function deleteMovie(id, title) {
  if (!confirm(`¿Eliminar "${title}"? El archivo no se borrará del NAS.`)) return;
  await apiFetch(`/movies/${id}`, { method: 'DELETE' });
  document.getElementById('editOverlay').style.display = 'none';
  showToast(`"${title}" eliminada`); loadDashboard(); loadLibrary();
}

// ── UPLOAD ──
const dropZone  = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const CHUNK     = 50 * 1024 * 1024;

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragging'); startUpload(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) startUpload(fileInput.files[0]); });

async function startUpload(file) {
  const folder      = document.getElementById('uploadFolder').value.trim() || 'uploads';
  const progressEl  = document.getElementById('uploadProgress');
  const resultEl    = document.getElementById('uploadResult');
  const errorEl     = document.getElementById('uploadError');
  progressEl.style.display = 'block';
  resultEl.style.display = errorEl.style.display = 'none';
  document.getElementById('uploadFileName').textContent = file.name;
  document.getElementById('uploadPercent').textContent = '0%';
  document.getElementById('progressFill').style.width = '0%';

  const total     = Math.ceil(file.size / CHUNK);
  const startTime = Date.now();
  try {
    for (let i = 0; i < total; i++) {
      const params = new URLSearchParams({ filename: file.name, chunkIndex: i, totalChunks: total, folder });
      const res    = await fetch(`/upload/chunk?${params}`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken, 'Content-Type': 'application/octet-stream' },
        body: file.slice(i * CHUNK, (i + 1) * CHUNK),
      });
      const data = await res.json();
      const pct  = Math.round(((i + 1) / total) * 100);
      const spd  = (((i + 1) * CHUNK) / ((Date.now() - startTime) / 1000) / 1024 / 1024).toFixed(1);
      document.getElementById('progressFill').style.width = `${pct}%`;
      document.getElementById('uploadPercent').textContent = `${pct}%`;
      document.getElementById('uploadSpeed').textContent = `${spd} MB/s`;
      if (data.assembled) {
        progressEl.style.display = 'none';
        resultEl.style.display = 'block';
        resultEl.innerHTML = `✓ <strong>${data.file_path}</strong>
          <button class="btn-primary btn-sm" style="margin-left:10px"
            onclick="window.setFilePath('${data.file_path}');document.querySelector('[data-section=add]').click()">
            → Agregar a biblioteca
          </button>`;
      }
    }
  } catch (err) {
    errorEl.textContent = err.message; errorEl.style.display = 'block';
    progressEl.style.display = 'none';
  }
}

// ── SCAN ──
let pendingFiles = [];
let importRunning = false, importStop = false;

document.getElementById('scanBtn').addEventListener('click', async () => {
  const dir = document.getElementById('scanFolder').value;
  const el  = document.getElementById('scanResults');
  el.innerHTML = '<p class="muted">Escaneando...</p>';
  pendingFiles = [];
  document.getElementById('addAllBtn').style.display = 'none';
  document.getElementById('addAllProgress').style.display = 'none';

  const params = dir ? `?dir=${encodeURIComponent(dir)}` : '';
  try {
    const res  = await fetch(`/stream/scan/files${params}`, { headers: { 'x-admin-token': adminToken } });
    const data = await res.json();

    if (!data.total) {
      el.innerHTML = `<p class="muted">No se encontraron videos. Dirs: ${data.media_dirs?.join(', ')}</p>`;
      return;
    }

    pendingFiles = data.dirs.flatMap(d => (d.files || []).filter(f => !f.already_added));
    const added  = data.dirs.flatMap(d => (d.files || []).filter(f =>  f.already_added));

    if (pendingFiles.length) {
      const btn = document.getElementById('addAllBtn');
      btn.textContent = `⚡ Importar los ${pendingFiles.length} archivos automáticamente`;
      btn.style.display = 'inline-flex';
    }

    let html = `<p class="muted" style="margin-bottom:14px">
      <strong style="color:#fff">${data.total}</strong> archivos —
      <span style="color:#6fcf97">${added.length} en biblioteca</span>,
      <span style="color:#e50914">${pendingFiles.length} pendientes</span>
    </p>`;

    for (const dirResult of data.dirs) {
      if (!dirResult.files?.length) continue;
      const typeLabel = dirResult.type === 'tv' ? '📺 Series' : '🎬 Películas';
      html += `<div class="scan-dir-header">${typeLabel} — <code>${dirResult.dir}</code></div>`;
      html += dirResult.files.map(f => `
        <div class="scan-file-item">
          <div class="scan-file-path">📄 ${f.display_path}</div>
          <div class="scan-file-size">${fmtSize(f.size)}</div>
          ${f.already_added
            ? `<span class="scan-added">✓ ${f.existing_title || 'En biblioteca'}</span>`
            : `<button class="btn-primary btn-sm" onclick="importOne('${f.path.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}','${f.auto_type}',${f.size || 0},this)">⬇ Importar</button>`
          }
        </div>`).join('');
    }
    el.innerHTML = html;
  } catch (err) { el.innerHTML = `<p class="error-msg">${err.message}</p>`; }
});

// Import a single file
async function importOne(filePath, type, fileSize, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
      body: JSON.stringify({ file_path: filePath, type, file_size: fileSize }),
    }).then(r => r.json());

    if (btn) {
      const row = btn.closest('.scan-file-item');
      if (res.skipped) {
        row.querySelector('.scan-file-size').insertAdjacentHTML('afterend', `<span class="scan-added">⚠ Ya existe</span>`);
      } else {
        row.querySelector('.scan-file-size').insertAdjacentHTML('afterend',
          `<span class="scan-added">✓ ${res.title}${res.year ? ` (${res.year})` : ''}${!res.tmdb_found ? ' ⚠sin metadata' : ''}</span>`);
      }
      btn.remove();
    }
    return res;
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = '⬇ Importar'; }
    throw err;
  }
}

// Bulk import all
document.getElementById('addAllBtn').addEventListener('click', async () => {
  if (!pendingFiles.length || importRunning) return;
  importRunning = true; importStop = false;

  document.getElementById('addAllBtn').style.display = 'none';
  document.getElementById('addAllStopBtn').style.display = 'inline-flex';
  document.getElementById('addAllProgress').style.display = 'block';
  document.getElementById('addAllLog').innerHTML = '';

  const total = pendingFiles.length;
  let done = 0, ok = 0, errors = 0;

  for (const file of pendingFiles) {
    if (importStop) break;

    document.getElementById('addAllStatus').textContent = `Importando: ${file.name}`;
    document.getElementById('addAllCount').textContent  = `${done + 1} / ${total}`;
    document.getElementById('addAllFill').style.width   = `${Math.round((done / total) * 100)}%`;

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
        body: JSON.stringify({ file_path: file.path, type: file.auto_type, file_size: file.size }),
      }).then(r => r.json());

      if (res.skipped) {
        addLog('skip', `⏭ ${file.name} — ya existe`);
      } else if (res.ok) {
        ok++;
        const srcBadge = res.source === 'tmdb' ? '🟢 TMDB' : res.source === 'omdb' ? '🟡 OMDb' : res.source === 'tmdb+omdb' ? '🟢 TMDB+OMDb' : '🔴 sin metadata';
        addLog(res.source !== 'none' ? 'ok' : 'err',
          `${srcBadge} — ${res.title}${res.year ? ` (${res.year})` : ''}`);
      }
    } catch (err) {
      errors++;
      addLog('err', `✗ ${file.name} — ${err.message}`);
    }

    done++;
    await new Promise(r => setTimeout(r, 250)); // respect TMDB rate limits
  }

  document.getElementById('addAllFill').style.width   = '100%';
  document.getElementById('addAllStatus').textContent = `Listo: ${ok} importados, ${errors} errores`;
  document.getElementById('addAllCount').textContent  = `${done} / ${total}`;
  document.getElementById('addAllStopBtn').style.display = 'none';
  importRunning = false;
  showToast(`✅ ${ok} títulos importados`);
  loadDashboard();
});

document.getElementById('addAllStopBtn').addEventListener('click', () => {
  importStop = true;
  document.getElementById('addAllStopBtn').style.display = 'none';
  showToast('Deteniendo...');
});

function addLog(type, msg) {
  const log  = document.getElementById('addAllLog');
  const item = document.createElement('div');
  item.className = `log-item log-${type}`;
  item.textContent = msg;
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
}

// ── REMATCH (actualizar metadata a castellano) ──
document.getElementById('rematchAllBtn').addEventListener('click', async () => {
  if (!confirm('Esto re-descarga la metadata de TODOS los títulos desde TMDB en español (es-ES). Puede tardar varios minutos. ¿Continuar?')) return;

  const progEl  = document.getElementById('rematchProgress');
  const statEl  = document.getElementById('rematchStatus');
  const cntEl   = document.getElementById('rematchCount');
  const fillEl  = document.getElementById('rematchFill');
  const logEl   = document.getElementById('rematchLog');
  progEl.style.display = 'block';
  logEl.innerHTML = '';

  // Get all IDs with TMDB data
  const type = document.getElementById('libType').value || null;
  const body = { limit: 2000 };
  if (type) body.type = type;

  const { ids } = await fetch('/api/rematch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
    body: JSON.stringify(body),
  }).then(r => r.json());

  const total = ids.length;
  let done = 0, ok = 0, errors = 0;

  for (const id of ids) {
    statEl.textContent = `Actualizando ID ${id}...`;
    cntEl.textContent  = `${done + 1} / ${total}`;
    fillEl.style.width = `${Math.round((done / total) * 100)}%`;

    try {
      const res = await fetch(`/api/rematch/${id}`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      }).then(r => r.json());

      if (res.ok) {
        ok++;
        const item = document.createElement('div');
        item.className = 'log-item log-ok';
        item.textContent = `✓ ${res.title} (${res.year || '?'})`;
        logEl.appendChild(item);
        logEl.scrollTop = logEl.scrollHeight;
      }
    } catch {
      errors++;
    }
    done++;
    await new Promise(r => setTimeout(r, 300)); // TMDB rate limit
  }

  fillEl.style.width = '100%';
  statEl.textContent = `Listo: ${ok} actualizados, ${errors} errores`;
  cntEl.textContent  = `${done} / ${total}`;
  showToast(`✓ ${ok} títulos actualizados a castellano`);
  loadLibrary();
});

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── INIT ──
init();
