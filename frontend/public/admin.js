const ADMIN_KEY   = 'lupeflix_admin';
const SESSION_KEY = 'lupeflix_session';
const USER_KEY    = 'lupeflix_user';
const TOKEN_KEY   = 'lupeflix_token';
let adminToken = localStorage.getItem(ADMIN_KEY) || '';
let userToken  = localStorage.getItem(TOKEN_KEY) || '';

async function getStoredUser() {
  try {
    const local = JSON.parse(localStorage.getItem(USER_KEY) || localStorage.getItem(SESSION_KEY) || 'null');
    if (local?.email) return local;
  } catch {}

  try {
    const r = await fetch('/api/auth/me');
    if (!r.ok) return null;
    const data = await r.json();
    if (data.token) {
      userToken = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
    }
    if (data.user) {
      const json = JSON.stringify(data.user);
      localStorage.setItem(USER_KEY, json);
      localStorage.setItem(SESSION_KEY, json);
      return data.user;
    }
  } catch {}
  return null;
}

// ── ADMIN EMAIL RESTRICTION ──
async function checkAdminAccess() {
  const session = await getStoredUser();
  if (!session?.email) return !!adminToken;
  try {
    const r = await fetch('/api/admin/check', { headers: { 'x-user-email': session.email } });
    const d = await r.json();
    return d.allowed;
  } catch { return true; } // if endpoint fails, allow (no restriction configured)
}

// ── TOKEN AUTH ──
async function verifyToken(token) {
  try {
    const r = await fetch('/api/movies?limit=1', { headers: { 'x-admin-token': token, 'x-user-token': userToken } });
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
        <a href="/home" style="color:#e50914;font-size:0.9rem">← Volver a LupeFlix</a>
      </div>`;
    document.getElementById('authScreen').style.display = 'flex';
    return;
  }

  if (userToken) { showAdmin(); return; }

  if (userToken) { showAdmin(); return; }

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
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
      'x-user-token': userToken,
      ...(opts.headers || {}),
    },
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
async function loadLibrary(search = '', type = '', meta = '') {
  const el = document.getElementById('libraryList');
  el.innerHTML = '<p class="muted" style="padding:12px 0">Cargando...</p>';
  try {
    let items = [];

    if (!type || type === 'movie') {
      const p = new URLSearchParams({ limit: 500, type: 'movie' });
      if (search) p.set('search', search);
      const d = await apiFetch(`/movies?${p}`);
      items.push(...d.results);
    }
    if (!type || type === 'documentary') {
      const p = new URLSearchParams({ limit: 200, type: 'documentary' });
      if (search) p.set('search', search);
      const d = await apiFetch(`/movies?${p}`);
      items.push(...d.results);
    }
    if (!type || type === 'tv') {
      const p = new URLSearchParams({ limit: 500 });
      if (search) p.set('search', search);
      const d = await apiFetch(`/series?${p}`);
      items.push(...d.results);
    }

    if (meta === 'no_meta')   items = items.filter(m => m.is_series ? !m.series_id : !m.tmdb_id);
    if (meta === 'with_meta') items = items.filter(m => m.is_series ?  !!m.series_id :  !!m.tmdb_id);
    if (meta === 'no_file')   items = items.filter(m => !m.is_series && !m.file_path);

    items.sort((a, b) => new Date(b.added_at || 0) - new Date(a.added_at || 0));
    renderLibraryList('libraryList', items);
  } catch (err) {
    el.innerHTML = `<p class="muted" style="padding:12px 0">Error al cargar: ${escHtml(err.message)}</p>`;
  }
}

function getLibFilters() {
  return [
    document.getElementById('libSearch').value,
    document.getElementById('libType').value,
    document.getElementById('libMeta').value,
  ];
}

document.getElementById('libSearch').addEventListener('input', () => {
  clearTimeout(libTimer);
  libTimer = setTimeout(() => loadLibrary(...getLibFilters()), 300);
});
document.getElementById('libType').addEventListener('change', () => loadLibrary(...getLibFilters()));
document.getElementById('libMeta').addEventListener('change', () => loadLibrary(...getLibFilters()));

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

function renderLibraryList(id, items) {
  const el = document.getElementById(id);
  if (!items?.length) { el.innerHTML = '<p class="muted" style="padding:12px 0">Sin títulos.</p>'; return; }
  el.innerHTML = items.map((m, i) => {
    const hasMeta = m.is_series ? !!m.series_id : !!m.tmdb_id;
    const metaBadge = hasMeta
      ? `<span class="badge-meta-ok">✓ Metadata</span>`
      : `<span class="badge-meta-warn">⚠ Sin metadata</span>`;

    if (m.is_series) {
      const epInfo = [
        m.episode_count ? `${m.episode_count} ep` : '',
        m.season_count > 1 ? `${m.season_count} temp` : '',
      ].filter(Boolean).join(', ');
      return `
        <div class="media-item media-series" data-idx="${i}" data-series-key="${escHtml(seriesKeyForAdmin(m))}">
          <img class="media-poster"
            src="${imgUrl(m.series_poster || m.poster_path) || 'https://placehold.co/44x60/16162a/444?text=?'}"
            alt="" onerror="this.src='https://placehold.co/44x60/16162a/444?text=?'" />
          <div class="media-info">
            <div class="media-title">${escHtml(m.series_title || m.title)}</div>
            <div class="media-meta">
              ${m.year ? `<span>${m.year}</span>` : ''}
              ${m.genres ? `<span>${escHtml(m.genres.split(',')[0].trim())}</span>` : ''}
              ${m.rating ? `<span>⭐ ${Number(m.rating).toFixed(1)}</span>` : ''}
              ${epInfo ? `<span>${epInfo}</span>` : ''}
              ${metaBadge}
            </div>
          </div>
          <div class="media-badge">SERIE</div>
          <div class="media-actions">
            <button class="btn-icon btn-toggle" title="Ver episodios" onclick="toggleSeriesEpisodes(${i})">▶</button>
            <button class="btn-icon" title="Identificar serie en TMDB" onclick="openSeriesIdentify(${i})">✏️</button>
            <button class="btn-icon" title="Actualizar metadata desde TMDB" onclick="refreshSeriesMeta(${i})">🔄</button>
          </div>
        </div>
        <div class="series-episodes-panel" id="sep-${i}" style="display:none"></div>`;
    }

    const badge = m.type === 'documentary' ? 'DOC' : 'FILM';
    const fileBadge = m.file_path
      ? `<span class="badge-file-ok">✓ Archivo</span>`
      : `<span class="badge-file-warn">Sin archivo</span>`;
    return `
      <div class="media-item">
        <img class="media-poster"
          src="${imgUrl(m.poster_path) || 'https://placehold.co/44x60/16162a/444?text=?'}"
          alt="" onerror="this.src='https://placehold.co/44x60/16162a/444?text=?'" />
        <div class="media-info">
          <div class="media-title">${escHtml(m.title)}</div>
          <div class="media-meta">
            ${m.year ? `<span>${m.year}</span>` : ''}
            ${m.genres ? `<span>${escHtml(m.genres.split(',')[0].trim())}</span>` : ''}
            ${m.rating ? `<span>⭐ ${Number(m.rating).toFixed(1)}</span>` : ''}
            ${fileBadge}
            ${metaBadge}
            ${m.views ? `<span>▶ ${m.views}</span>` : ''}
          </div>
        </div>
        <div class="media-badge">${badge}</div>
        <div class="media-actions">
          <button class="btn-icon" title="Editar" onclick="openEdit(${m.id})">✏️</button>
        </div>
      </div>`;
  }).join('');
}

async function toggleSeriesEpisodes(idx) {
  const panel = document.getElementById(`sep-${idx}`);
  const seriesEl = document.querySelector(`.media-series[data-idx="${idx}"]`);
  const btn = seriesEl?.querySelector('.btn-toggle');
  if (!panel) return;

  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    if (btn) btn.textContent = '▶';
    return;
  }

  panel.style.display = 'block';
  if (btn) btn.textContent = '▼';
  if (panel.dataset.loaded) return;

  const seriesKey = seriesEl.dataset.seriesKey;
  panel.innerHTML = '<p class="muted" style="padding:10px 60px">Cargando episodios...</p>';
  try {
    const data = await apiFetch(`/series/${encodeURIComponent(seriesKey)}/seasons`);
    renderEpisodesPanel(panel, data);
    panel.dataset.loaded = '1';
  } catch (err) {
    panel.innerHTML = `<p class="muted" style="padding:10px 60px">Error: ${escHtml(err.message)}</p>`;
  }
}

function renderEpisodesPanel(panel, data) {
  const seasons = data.seasons || {};
  const sortedSeasons = Object.entries(seasons).sort((a, b) => Number(a[0]) - Number(b[0]));
  let html = '<div class="episodes-container">';
  for (const [sNum, episodes] of sortedSeasons) {
    html += `<div class="season-header">Temporada ${escHtml(sNum)}</div>`;
    html += episodes.map(ep => {
      const s = String(ep.season_number || 1).padStart(2, '0');
      const e = String(ep.episode_number || 0).padStart(2, '0');
      const code = ep.episode_number ? `<span class="ep-code">S${s}E${e}</span>` : '';
      const title = escHtml(ep.episode_title || ep.title || '');
      const hasMeta = !!(ep.tmdb_id || ep.series_id);
      return `
        <div class="episode-item">
          <img class="ep-thumb"
            src="${imgUrl(ep.poster_path, 'w92') || 'https://placehold.co/80x45/16162a/444?text=?'}"
            alt="" onerror="this.src='https://placehold.co/80x45/16162a/444?text=?'" />
          <div class="ep-info">
            <div class="ep-title">${code}${title}</div>
            <div class="ep-meta">
              ${ep.file_path ? '<span class="badge-file-ok">✓ Archivo</span>' : '<span class="badge-file-warn">Sin archivo</span>'}
              ${hasMeta ? '<span class="badge-meta-ok">✓ Metadata</span>' : '<span class="badge-meta-warn">⚠ Sin metadata</span>'}
            </div>
          </div>
          <button class="btn-icon" title="Editar episodio" onclick="openEdit(${ep.id})">✏️</button>
        </div>`;
    }).join('');
  }
  html += '</div>';
  panel.innerHTML = html;
}

async function refreshSeriesMeta(idx) {
  const seriesEl = document.querySelector(`.media-series[data-idx="${idx}"]`);
  if (!seriesEl) return;
  const seriesKey = seriesEl.dataset.seriesKey;
  if (!seriesKey) { showToast('Error: serie sin clave identificable'); return; }
  const btns = seriesEl.querySelectorAll('.btn-icon');
  const btn  = btns[2]; // third button is 🔄
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    await apiFetch(`/series/${encodeURIComponent(seriesKey)}/refresh-metadata`, { method: 'POST' });
    showToast('✓ Metadata de serie actualizada');
    loadLibrary(...getLibFilters());
  } catch (err) {
    showToast('Error: ' + escHtml(err.message));
    if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
  }
}

// ── SERIES IDENTIFY ──
async function openSeriesIdentify(idx) {
  const seriesEl = document.querySelector(`.media-series[data-idx="${idx}"]`);
  if (!seriesEl) return;
  const seriesKey   = seriesEl.dataset.seriesKey;
  if (!seriesKey) { showToast('Error: serie sin clave identificable'); return; }
  const seriesTitle = seriesEl.querySelector('.media-title')?.textContent || '';

  // Open panel and show identify form at top
  const panel = document.getElementById(`sep-${idx}`);
  panel.style.display = 'block';
  if (seriesEl.querySelector('.btn-toggle')) seriesEl.querySelector('.btn-toggle').textContent = '▼';

  panel.innerHTML = `
    <div class="series-identify-panel">
      <p class="muted" style="margin-bottom:8px;font-size:0.82rem;font-weight:600">Identificar serie en TMDB</p>
      <div class="tmdb-search-row" style="margin-bottom:12px">
        <input type="text" id="sid-q-${idx}" class="search-input" value="${escHtml(seriesTitle)}"
          placeholder="Nombre de la serie..."
          onkeydown="if(event.key==='Enter'){event.preventDefault();searchSeriesTmdb(${idx})}" />
        <button class="btn-primary btn-sm" onclick="searchSeriesTmdb(${idx})">Buscar</button>
        <button class="btn-ghost btn-sm" onclick="document.getElementById('sep-${idx}').style.display='none'">✕</button>
      </div>
      <div id="sid-r-${idx}" class="tmdb-results"></div>
    </div>`;

  // Auto-trigger search with current series title
  await searchSeriesTmdb(idx);
}

async function searchSeriesTmdb(idx) {
  const q  = document.getElementById(`sid-q-${idx}`)?.value.trim();
  const el = document.getElementById(`sid-r-${idx}`);
  if (!q || !el) return;
  el.innerHTML = '<p class="muted">Buscando...</p>';
  try {
    const data = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=tv`).then(r => r.json());
    if (!data.results?.length) { el.innerHTML = '<p class="muted">Sin resultados. Prueba con el título original.</p>'; return; }
    el.innerHTML = data.results.slice(0, 8).map(item => {
      const title  = escHtml(item.name || item.title || '');
      const year   = (item.first_air_date || '').slice(0, 4);
      const rating = item.vote_average ? ` · ⭐${Number(item.vote_average).toFixed(1)}` : '';
      const poster = item.poster_path
        ? `https://image.tmdb.org/t/p/w185${item.poster_path}`
        : `https://placehold.co/130x195/16162a/444?text=${encodeURIComponent(item.name || '?')}`;
      return `<div class="tmdb-card" onclick="applySeriesMatch(${idx}, ${item.id})">
        <img src="${poster}" alt="${title}" />
        <div class="tmdb-card-title">${title}</div>
        <div class="tmdb-card-year">${year}${rating}</div>
      </div>`;
    }).join('');
  } catch (err) {
    el.innerHTML = `<p class="muted">Error: ${escHtml(err.message)}</p>`;
  }
}

async function applySeriesMatch(idx, tmdbId) {
  const seriesEl = document.querySelector(`.media-series[data-idx="${idx}"]`);
  const seriesKey = seriesEl?.dataset.seriesKey;
  if (!seriesKey) { showToast('Error: serie sin clave identificable'); return; }
  const el = document.getElementById(`sid-r-${idx}`);
  if (el) el.innerHTML = '<p class="muted">Aplicando metadatos a todos los episodios... puede tardar unos segundos.</p>';
  try {
    await apiFetch(`/series/${encodeURIComponent(seriesKey)}/set-tmdb`, {
      method: 'POST',
      body: JSON.stringify({ tmdb_id: tmdbId }),
    });
    showToast('✓ Serie identificada y episodios actualizados');
    loadLibrary(...getLibFilters());
  } catch (err) {
    showToast('Error: ' + escHtml(err.message));
    if (el) el.innerHTML = `<p class="muted">Error: ${escHtml(err.message)}</p>`;
  }
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

function setIdentifyType(m) {
  document.getElementById('editMatchType').value = m.type === 'tv' ? 'tv' : 'movie';
}

async function openEdit(id, openMatcher = false) {
  try {
    const m = await apiFetch(`/movies/${id}`);
    currentEditMovie = m;
    const form = document.getElementById('editForm');
    Object.keys(m).forEach(k => { if (form.elements[k]) form.elements[k].value = m[k] ?? ''; });
    document.getElementById('deleteBtn').onclick = () => deleteMovie(id, m.title);
    document.getElementById('editOverlay').style.display = 'flex';
    document.getElementById('editIdentifyPanel').style.display = openMatcher ? 'block' : 'none';
    document.getElementById('autoIdentifyStatus').style.display = 'none';
    document.getElementById('editMatchQuery').value = m.series_title || m.title || '';
    setIdentifyType(m);
    document.getElementById('editMatchResults').innerHTML = '';
    if (openMatcher) triggerAutoIdentify();
  } catch { showToast('Error al cargar'); }
}

// Open identify panel + auto-search
document.getElementById('editIdentifyBtn').addEventListener('click', () => {
  if (!currentEditMovie) return;
  document.getElementById('editIdentifyPanel').style.display = 'block';
  document.getElementById('editMatchQuery').value = currentEditMovie.series_title || currentEditMovie.title || '';
  setIdentifyType(currentEditMovie);
  triggerAutoIdentify();
});

// Auto-identify: calls backend smart search, shows candidates
document.getElementById('autoIdentifyBtn').addEventListener('click', triggerAutoIdentify);

async function triggerAutoIdentify() {
  if (!currentEditMovie) return;
  const btn    = document.getElementById('autoIdentifyBtn');
  const status = document.getElementById('autoIdentifyStatus');
  const el     = document.getElementById('editMatchResults');
  btn.disabled = true; btn.textContent = '⏳ Buscando...';
  status.style.display = 'none';
  el.innerHTML = '<p class="muted">Buscando en TMDB con múltiples estrategias...</p>';

  try {
    const data = await apiFetch(`/rematch/${currentEditMovie.id}/auto-search`, { method: 'POST' });
    if (!data.results?.length) {
      status.textContent = '⚠ No se encontraron resultados automáticos. Usa la búsqueda manual.';
      status.style.display = 'block';
      el.innerHTML = '';
    } else {
      status.textContent = `Buscado como: "${data.searched_as}" — seleccioná el correcto:`;
      status.style.display = 'block';
      renderMatchResults(el, data.results, data.media_type);
    }
  } catch (err) {
    el.innerHTML = `<p class="muted">Error: ${escHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false; btn.textContent = '🔍 Auto-identificar';
  }
}

// Manual search from the search box
document.getElementById('editMatchSearch').addEventListener('click', searchEditMatches);
document.getElementById('editMatchQuery').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); searchEditMatches(); }
});

async function searchEditMatches() {
  if (!currentEditMovie) return;
  const q        = document.getElementById('editMatchQuery').value.trim();
  const type     = document.getElementById('editMatchType').value;
  const tmdbType = type === 'documentary' ? 'movie' : type;
  const el       = document.getElementById('editMatchResults');
  if (!q) return;
  el.innerHTML = '<p class="muted">Buscando...</p>';
  try {
    const data = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=${tmdbType}`).then(r => r.json());
    if (!data.results?.length) { el.innerHTML = '<p class="muted">Sin resultados. Prueba con el título original o en inglés.</p>'; return; }
    renderMatchResults(el, data.results.slice(0, 12).map(r => ({
      id:           r.id,
      media_type:   tmdbType,
      title:        r.title || r.name || '',
      year:         parseInt((r.release_date || r.first_air_date || '').slice(0, 4)) || null,
      poster_path:  r.poster_path || null,
      vote_average: r.vote_average || null,
    })), tmdbType);
  } catch { el.innerHTML = '<p class="muted">Error buscando en TMDB.</p>'; }
}

function renderMatchResults(el, results, mediaType) {
  el.innerHTML = results.map(item => {
    const poster = item.poster_path
      ? `https://image.tmdb.org/t/p/w185${item.poster_path}`
      : `https://placehold.co/130x195/16162a/444?text=${encodeURIComponent(item.title || '?')}`;
    const score = item.vote_average ? ` · ⭐${Number(item.vote_average).toFixed(1)}` : '';
    return `<div class="tmdb-card" onclick="applyEditMatch(${item.id}, '${escHtml(mediaType)}')">
      <img src="${poster}" alt="${escHtml(item.title)}" />
      <div class="tmdb-card-title">${escHtml(item.title)}</div>
      <div class="tmdb-card-year">${item.year || ''}${score}</div>
    </div>`;
  }).join('');
}

async function applyEditMatch(tmdbId, type) {
  if (!currentEditMovie) return;
  const el = document.getElementById('editMatchResults');
  el.innerHTML = '<p class="muted">Aplicando metadatos...</p>';
  try {
    const body = { tmdb_id: Number(tmdbId), type };
    await apiFetch(`/rematch/${currentEditMovie.id}/identify`, { method: 'POST', body: JSON.stringify(body) });
    showToast('✓ Metadatos aplicados correctamente');
    await openEdit(currentEditMovie.id, false);
    loadDashboard();
    loadLibrary();
  } catch (err) {
    el.innerHTML = `<p class="muted">${escHtml(err.message)}</p>`;
  }
}

document.getElementById('editClose').addEventListener('click', () => { document.getElementById('editOverlay').style.display = 'none'; });

document.getElementById('editRematchBtn').addEventListener('click', async () => {
  if (!currentEditMovie) return;
  if (!currentEditMovie.tmdb_id) { showToast('Sin TMDB ID — identificá los metadatos primero'); return; }
  const btn = document.getElementById('editRematchBtn');
  btn.disabled = true; btn.textContent = '⏳ Actualizando...';
  try {
    const res = await apiFetch(`/rematch/${currentEditMovie.id}`, { method: 'POST' });
    showToast(`✓ "${res.title}" actualizado a castellano`);
    await openEdit(currentEditMovie.id, false);
    loadLibrary();
  } catch (err) {
    showToast('Error: ' + escHtml(err.message));
  } finally {
    btn.disabled = false; btn.textContent = '🌐 Actualizar a Castellano';
  }
});
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
        headers: { 'x-admin-token': adminToken, 'x-user-token': userToken, 'Content-Type': 'application/octet-stream' },
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
    const res  = await fetch(`/stream/scan/files${params}`, { headers: { 'x-admin-token': adminToken, 'x-user-token': userToken } });
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
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken, 'x-user-token': userToken },
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
        headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken, 'x-user-token': userToken },
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

// ── AUTO-FILL MISSING METADATA ──
let autoFillRunning = false, autoFillStop = false;

document.getElementById('autoFillBtn').addEventListener('click', async () => {
  if (autoFillRunning) return;
  const typeFilter = document.getElementById('libType').value;
  if (typeFilter === 'tv') { showToast('Las series se actualizan con 🔄 en cada fila'); return; }
  if (!confirm('Buscará y aplicará metadatos automáticamente a todos los títulos que no tienen aún. Puede tardar varios minutos. ¿Continuar?')) return;

  autoFillRunning = true; autoFillStop = false;
  const progEl = document.getElementById('autoFillProgress');
  const statEl = document.getElementById('autoFillStatus');
  const cntEl  = document.getElementById('autoFillCount');
  const fillEl = document.getElementById('autoFillBar');
  const logEl  = document.getElementById('autoFillLog');
  progEl.style.display = 'block';
  logEl.innerHTML = '';
  document.getElementById('autoFillBtn').disabled = true;

  const body = { limit: 1000 };
  if (typeFilter && typeFilter !== 'tv') body.type = typeFilter;

  let ids = [];
  try {
    const res = await apiFetch('/rematch/ids-missing', { method: 'POST', body: JSON.stringify(body) });
    ids = res.ids || [];
  } catch (err) {
    statEl.textContent = 'Error obteniendo lista: ' + err.message;
    autoFillRunning = false;
    document.getElementById('autoFillBtn').disabled = false;
    return;
  }

  if (!ids.length) {
    statEl.textContent = '✓ No hay títulos sin metadata';
    cntEl.textContent = '0 / 0';
    autoFillRunning = false;
    document.getElementById('autoFillBtn').disabled = false;
    return;
  }

  const total = ids.length;
  let done = 0, ok = 0, notFound = 0;

  for (const id of ids) {
    if (autoFillStop) break;
    cntEl.textContent  = `${done + 1} / ${total}`;
    fillEl.style.width = `${Math.round((done / total) * 100)}%`;

    try {
      const res = await apiFetch(`/rematch/${id}/auto`, { method: 'POST' });
      const item = document.createElement('div');
      if (res.skipped) {
        item.className = 'log-item log-skip';
        item.textContent = `⏭ Ya tenía metadata`;
      } else if (res.ok) {
        ok++;
        item.className = 'log-item log-ok';
        item.textContent = `✓ ${res.title}${res.year ? ` (${res.year})` : ''}`;
        statEl.textContent = `Procesando: ${res.title || ''}`;
      } else {
        notFound++;
        item.className = 'log-item log-err';
        item.textContent = `✗ No encontrado: ${res.title || `ID ${id}`}`;
      }
      logEl.appendChild(item);
      logEl.scrollTop = logEl.scrollHeight;
    } catch (err) {
      notFound++;
      const item = document.createElement('div');
      item.className = 'log-item log-err';
      item.textContent = `✗ ID ${id} — ${err.message}`;
      logEl.appendChild(item);
    }

    done++;
    await new Promise(r => setTimeout(r, 350)); // TMDB rate limit
  }

  fillEl.style.width = '100%';
  statEl.textContent = `Listo: ${ok} actualizados, ${notFound} no encontrados`;
  cntEl.textContent  = `${done} / ${total}`;
  showToast(`✅ ${ok} títulos con nueva metadata`);
  autoFillRunning = false;
  document.getElementById('autoFillBtn').disabled = false;
  loadLibrary(...getLibFilters());
});

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── SETTINGS ──
const LANGUAGES = [
  { code: 'es-ES', name: 'Español (Castellano)', flag: '🇪🇸' },
  { code: 'es-MX', name: 'Español (Latino)',     flag: '🌎' },
  { code: 'en-US', name: 'English (US)',          flag: '🇺🇸' },
  { code: 'en-GB', name: 'English (UK)',          flag: '🇬🇧' },
  { code: 'fr-FR', name: 'Français',              flag: '🇫🇷' },
  { code: 'de-DE', name: 'Deutsch',               flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italiano',              flag: '🇮🇹' },
  { code: 'pt-BR', name: 'Português (Brasil)',    flag: '🇧🇷' },
  { code: 'pt-PT', name: 'Português (Portugal)',  flag: '🇵🇹' },
  { code: 'ja-JP', name: '日本語',                flag: '🇯🇵' },
  { code: 'ko-KR', name: '한국어',                flag: '🇰🇷' },
  { code: 'zh-CN', name: '中文 (简体)',            flag: '🇨🇳' },
];

let currentSavedLang = 'es-ES';
let selectedLang     = 'es-ES';

async function loadSettings() {
  try {
    const data = await apiFetch('/settings');
    currentSavedLang = data.tmdb_language || 'es-ES';
    selectedLang     = currentSavedLang;
    renderLangGrid();
    updateSettingsFooter();
  } catch {
    document.getElementById('settingsCurrentLang').textContent = 'Error al cargar configuración';
  }
}

function renderLangGrid() {
  const grid = document.getElementById('langGrid');
  if (!grid) return;
  grid.innerHTML = LANGUAGES.map(l => `
    <button type="button" class="lang-option${l.code === selectedLang ? ' selected' : ''}${l.code === currentSavedLang ? ' current-active' : ''}"
      data-code="${l.code}" onclick="selectLang('${l.code}')">
      <span class="lang-flag">${l.flag}</span>
      <span class="lang-info">
        <span class="lang-name">${l.name}</span>
        <span class="lang-code">${l.code}</span>
      </span>
      <span class="lang-check">✓</span>
    </button>
  `).join('');
}

function selectLang(code) {
  selectedLang = code;
  renderLangGrid();
  updateSettingsFooter();
}

function updateSettingsFooter() {
  const noteEl = document.getElementById('settingsCurrentLang');
  const saveBtn = document.getElementById('saveLangBtn');
  const lang = LANGUAGES.find(l => l.code === currentSavedLang);
  const hasChange = selectedLang !== currentSavedLang;
  noteEl.innerHTML = `Activo: <strong>${lang ? lang.flag + ' ' + lang.name : currentSavedLang}</strong>`;
  if (saveBtn) saveBtn.disabled = !hasChange;
}

document.getElementById('saveLangBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('saveLangBtn');
  btn.disabled = true;
  btn.textContent = 'Guardando...';
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken, 'x-user-token': userToken },
      body: JSON.stringify({ tmdb_language: selectedLang }),
    }).then(r => r.json());
    currentSavedLang = selectedLang;
    renderLangGrid();
    updateSettingsFooter();
    showToast('✅ Idioma guardado correctamente');
  } catch {
    showToast('❌ Error al guardar');
    btn.disabled = false;
  } finally {
    btn.textContent = 'Guardar cambio';
  }
});

// Load settings when section becomes active
document.querySelectorAll('.nav-item[data-section]').forEach(item => {
  item.addEventListener('click', () => {
    if (item.dataset.section === 'settings') loadSettings();
  });
});

// ── INIT ──
init();
