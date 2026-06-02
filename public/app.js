/* ── BOOT ── */
const SESSION_KEY = 'lupeflix_session';
const TOKEN_KEY   = 'lupeflix_token';
const userToken   = localStorage.getItem(TOKEN_KEY);
const session     = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
if (!userToken || !session) { window.location.href = 'index.html'; }

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

/* ── USER ── */
document.getElementById('userName').textContent = session.name;
const av = document.getElementById('userAvatar');
if (session.picture) { av.style.cssText = `background:url(${session.picture}) center/cover;`; }
else av.textContent = session.name[0].toUpperCase();
let isAdminUser = false;

(async () => {
  const r = await fetch('/api/admin/check', { headers: { 'x-user-email': session.email } }).catch(() => ({ json: () => ({}) }));
  const d = await r.json().catch(() => ({}));
  if (d.allowed) {
    isAdminUser = true;
    document.getElementById('adminLink').style.display = 'flex';
  }
})();

document.getElementById('logoutBtn').addEventListener('click', async e => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST', headers: auth() }).catch(() => {});
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
});

/* ── NAVBAR SCROLL ── */
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('solid', window.scrollY > 60);
}, { passive: true });

/* ── SEARCH ── */
const searchBox   = document.getElementById('searchBox');
const searchInput = document.getElementById('searchInput');
document.getElementById('searchToggle').addEventListener('click', () => {
  searchBox.classList.toggle('open');
  if (searchBox.classList.contains('open')) searchInput.focus();
});
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const q = searchInput.value.trim();
    if (q.length > 1) doSearch(q);
    else if (!q) renderHome();
  }, 380);
});

/* ── API ── */
function auth() { return { 'x-user-token': userToken, 'Content-Type': 'application/json' }; }

async function get(path, params = {}) {
  const url = new URL(`${location.origin}/api${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers: auth() });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function readJsonResponse(response, fallbackMessage = 'Error al cargar datos') {
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : { error: await response.text().catch(() => fallbackMessage) };
  if (!response.ok) {
    const message = data.error && !String(data.error).includes('<!DOCTYPE') ? data.error : fallbackMessage;
    throw new Error(message);
  }
  return data;
}

function img(p, size = 'w342') {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  return `https://image.tmdb.org/t/p/${size}${p}`;
}
function poster(m)   { return img(m.poster_path)  || `https://placehold.co/300x450/1f1f1f/444?text=${encodeURIComponent(m.title||'?')}`; }
function backdrop(m) { return img(m.backdrop_path, 'original'); }

function escHtml(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch])); }
function escAttr(v) { return escHtml(v); }

/* ── THREE.JS STARS ── */
function initStars() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas || typeof THREE === 'undefined') return;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
  const scene    = new THREE.Scene();
  const camera   = new THREE.PerspectiveCamera(60, canvas.offsetWidth / canvas.offsetHeight, 0.1, 1000);
  camera.position.z = 400;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(1400 * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = (Math.random() - 0.5) * 1400;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1, transparent: true, opacity: 0.45 }));
  scene.add(stars);
  const resize = () => { renderer.setSize(canvas.offsetWidth, canvas.offsetHeight); camera.aspect = canvas.offsetWidth / canvas.offsetHeight; camera.updateProjectionMatrix(); };
  resize(); window.addEventListener('resize', resize);
  let mx = 0, my = 0;
  document.addEventListener('mousemove', e => { mx = (e.clientX / innerWidth - 0.5) * 0.25; my = (e.clientY / innerHeight - 0.5) * 0.25; }, { passive: true });
  (function tick() { requestAnimationFrame(tick); stars.rotation.y += 0.0002 + mx * 0.001; stars.rotation.x += 0.00005 + my * 0.0005; renderer.render(scene, camera); })();
}

/* ── HERO ── */
let heroItems = [], heroIdx = 0, heroTimer;

async function loadHero() {
  try {
    heroItems = await get('/movies/featured');
    if (!heroItems.length) return showEmptyHero();
    renderHero(0); buildHeroDots(); startHeroTimer(); initStars();
  } catch { showEmptyHero(); }
}

function renderHero(i) {
  const m  = heroItems[i];
  const bg = backdrop(m);
  if (bg) document.getElementById('heroBg').style.backgroundImage = `url(${bg})`;

  const type = m.is_series ? 'Serie' : m.type === 'documentary' ? 'Documental' : 'Película';
  document.getElementById('heroEyebrow').textContent = type;
  document.getElementById('heroTitle').textContent = m.title || m.series_title || '';
  document.getElementById('heroDesc').textContent  = m.description || '';

  const parts = [m.year, m.rating ? `${Number(m.rating).toFixed(1)} / 10` : null, m.episode_count ? `${m.episode_count} episodios` : null].filter(Boolean);
  document.getElementById('heroMeta').innerHTML = parts.map((p, j) =>
    j < parts.length - 1 ? `${p}<span class="hero-meta-dot"></span>` : p
  ).join('');

  const playBtn = document.getElementById('heroPlay');
  const infoBtn = document.getElementById('heroInfo');

  if (m.is_series) {
    playBtn.style.display = 'none';
    infoBtn.onclick = () => showSeriesModal(m.series_key || m.series_id || m.series_title || m.title);
  } else {
    playBtn.style.display = 'flex';
    playBtn.onclick = () => m.file_path ? play(m.id, m.title) : showToast('Sin archivo de video');
    infoBtn.onclick = () => showDetail(m.id);
  }

  document.querySelectorAll('.hero-dot').forEach((d, j) => d.classList.toggle('active', j === i));
  heroIdx = i;

  if (typeof gsap !== 'undefined') gsap.fromTo('#heroContent', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' });
}

function buildHeroDots() {
  document.getElementById('heroDots').innerHTML = heroItems.map((_, i) =>
    `<div class="hero-dot ${i === 0 ? 'active' : ''}"></div>`
  ).join('');
  document.querySelectorAll('.hero-dot').forEach((d, i) => d.addEventListener('click', () => jumpHero(i)));
}
function jumpHero(i) { clearInterval(heroTimer); renderHero(i); startHeroTimer(); }
function startHeroTimer() { heroTimer = setInterval(() => renderHero((heroIdx + 1) % heroItems.length), 8000); }
function showEmptyHero() { document.getElementById('heroTitle').textContent = 'Bienvenido a LupeFlix'; document.getElementById('heroDesc').textContent = 'Accede al panel de administración para añadir tu contenido.'; document.getElementById('heroEyebrow').textContent = ''; document.getElementById('heroPlay').style.display = 'none'; document.getElementById('heroInfo').onclick = () => location.href = 'admin.html'; initStars(); }

/* ── GENRE BAR ── */
let activeGenre = '';
async function buildGenreBar(type = null) {
  try {
    const params = { limit: 999 };
    if (type) params.type = type;
    const data   = await get('/movies', params);
    const genres = new Set();
    data.results.forEach(m => (m.genres || '').split(',').forEach(g => { const t = g.trim(); if (t) genres.add(t); }));
    if (!genres.size) { document.getElementById('genreBar').style.display = 'none'; return; }

    const bar = document.getElementById('genreScroll');
    bar.innerHTML = `<button class="genre-chip active" data-g="">Todos</button>` +
      [...genres].sort().map(g => `<button class="genre-chip" data-g="${g}">${g}</button>`).join('');

    bar.querySelectorAll('.genre-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.genre-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeGenre = btn.dataset.g;
        if (activeGenre) filterByGenre(activeGenre, type);
        else if (type) filterByType(type);
        else renderHome();
      });
    });

    document.getElementById('genreBar').style.display = 'block';
  } catch {}
}

/* ── SECTIONS ── */
const HOME_SECTIONS = [
  { title: 'Continuar viendo',    type: 'continue' },
  { title: 'Recién añadidas',     endpoint: '/movies/recent',  params: {} },
  { title: 'Las mejor valoradas', endpoint: '/movies/top',     params: {}, topRated: true },
  { title: 'Películas',           endpoint: '/movies',         params: { type: 'movie', limit: 24 } },
  { title: 'Series',              endpoint: '/series',         params: { limit: 24 }, isSeries: true },
  { title: 'Documentales',        endpoint: '/movies',         params: { type: 'documentary', limit: 24 } },
];

async function renderHome() {
  setNavActive('home');
  document.getElementById('genreBar').style.display = 'none';
  const wrap = document.getElementById('sections');
  wrap.innerHTML = '';

  for (const s of HOME_SECTIONS) {
    if (s.type === 'continue') { await renderContinue(wrap); continue; }
    const el = mkSkeleton(s.title);
    wrap.appendChild(el);
  }

  const nonCont = HOME_SECTIONS.filter(s => s.type !== 'continue');
  const slots   = wrap.querySelectorAll('.section:not(.continue-section)');

  for (let i = 0; i < nonCont.length; i++) {
    const s  = nonCont[i];
    const el = slots[i];
    if (!el) continue;
    try {
      const data  = await get(s.endpoint, s.params);
      const items = Array.isArray(data) ? data : (data.results || []);
      if (!items.length) { el.style.display = 'none'; continue; }
      el.innerHTML = buildSectionHTML(s.title, items, s.isSeries, s.topRated);
      wireSection(el);
    } catch {}
  }
}

async function renderContinue(wrap) {
  try {
    const hist = await fetch('/api/user/history', { headers: auth() }).then(r => r.json());
    const inProg = hist.filter(m => m.progress > 30 && !m.completed);
    if (!inProg.length) return;
    const el = document.createElement('div');
    el.className = 'section continue-section';
    el.innerHTML = `
      <div class="section-header"><div class="section-title">Continuar viendo</div></div>
      <div class="carousel"><div class="carousel-track">
        ${inProg.map(m => {
          const pct = m.h_duration > 0 ? Math.round(m.progress / m.h_duration * 100) : 0;
          const rem = m.h_duration  > 0 ? Math.round((m.h_duration - m.progress) / 60) : 0;
          return `<div class="continue-card" data-id="${m.id}">
            <button class="continue-remove" data-id="${m.id}" title="Quitar de continuar viendo">?</button>
            <img class="continue-thumb" src="${poster(m)}" />
            <div class="continue-bar"><div class="continue-fill" style="width:${pct}%"></div></div>
            <div class="continue-meta"><div class="continue-title">${escHtml(m.title)}</div><div class="continue-time">${rem > 0 ? `${rem} min restantes` : 'Casi terminada'}</div></div>
          </div>`;
        }).join('')}
      </div></div>`;
    wrap.appendChild(el);
    el.querySelectorAll('.continue-card').forEach(c => c.addEventListener('click', () => play(+c.dataset.id, c.querySelector('.continue-title')?.textContent || '')));
    el.querySelectorAll('.continue-remove').forEach(btn => btn.addEventListener('click', async e => {
      e.stopPropagation();
      await fetch(`/api/user/history/${btn.dataset.id}`, { method: 'DELETE', headers: auth() }).catch(() => {});
      btn.closest('.continue-card')?.remove();
      showToast('Quitado de continuar viendo');
    }));
  } catch {}
}

function mkSkeleton(title) {
  const el = document.createElement('div'); el.className = 'section';
  el.innerHTML = `<div class="section-header"><div class="section-title">${title}</div></div>
    <div class="carousel"><div class="carousel-track">${Array(10).fill('<div class="card-skeleton skeleton"></div>').join('')}</div></div>`;
  return el;
}

function buildSectionHTML(title, items, isSeries = false, topRated = false) {
  const cards = items.map(m => buildCard(m, isSeries, topRated)).join('');
  return `
    <div class="section-header"><div class="section-title">${title}</div></div>
    <div class="carousel">
      <button class="carousel-arrow left"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15,18 9,12 15,6"/></svg></button>
      <div class="carousel-track">${cards}</div>
      <button class="carousel-arrow right"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg></button>
    </div>`;
}

function buildCard(m, isSeries = false, topRated = false) {
  // A card is a "series" if explicitly flagged OR if the DB row has is_series=1 (grouped query)
  const isSer  = isSeries || !!m.is_series;
  const title  = isSer ? (m.series_title || m.title) : m.title;
  const p      = isSer
    ? (img(m.series_poster || m.poster_path) || `https://placehold.co/300x450/1f1f1f/444?text=${encodeURIComponent(title||'?')}`)
    : poster(m);
  const badge  = isSer ? 'SERIE' : m.type === 'documentary' ? 'DOC' : 'FILM';
  const badgeCls = isSer ? 'card-badge-blue' : 'card-badge-red';
  // Always use data-series for series so clicks route correctly
  const key    = isSer
    ? `data-series="${escAttr(m.series_key || m.series_id || m.series_title || m.title)}"`
    : `data-id="${m.id}"`;
  const info   = isSer && m.episode_count ? `${m.episode_count} episodios` : (m.year || '');
  const ratingBadge = topRated && m.rating
    ? `<div class="card-rating-badge"><span class="card-score">${Number(m.rating).toFixed(1)}</span><span class="card-score-label">/10</span></div>`
    : '';

  return `
    <div class="card" ${key}>
      <div class="card-inner">
        <img src="${p}" alt="${escAttr(title)}" loading="lazy" onerror="this.src='https://placehold.co/300x450/1f1f1f/444?text=${encodeURIComponent(title||'?')}'" />
        ${ratingBadge}
        <div class="card-badge ${badgeCls}">${badge}</div>
        ${m.year && !topRated && !isSer ? `<div class="card-year">${m.year}</div>` : ''}
        <div class="card-info">
          <div class="card-title">${escHtml(title)}</div>
          ${info ? `<div class="card-sub">${info}</div>` : ''}
        </div>
      </div>
    </div>`;
}

function wireSection(el) {
  const track = el.querySelector('.carousel-track');
  el.querySelector('.carousel-arrow.left')?.addEventListener('click',  () => track.scrollBy({ left: -600, behavior: 'smooth' }));
  el.querySelector('.carousel-arrow.right')?.addEventListener('click', () => track.scrollBy({ left:  600, behavior: 'smooth' }));
  el.querySelectorAll('.card').forEach(wireCard);
}

function wireCard(c) {
  c.addEventListener('click', () => {
    if (c.dataset.series) {
      showSeriesModal(c.dataset.series);
    } else if (c.dataset.id && c.dataset.id !== 'null' && c.dataset.id !== 'undefined') {
      showDetail(+c.dataset.id);
    }
  });
}

/* ── NAV VIEWS ── */
function setNavActive(view) {
  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.view === view));
}

async function filterByType(type) {
  setNavActive(type === 'movie' ? 'movies' : type === 'tv' ? 'series' : 'documentaries');
  if (type === 'tv') {
    buildGenreBar('tv');
    const data  = await get('/series', { limit: 300 });
    renderGrid(type === 'tv' ? 'Series' : 'Películas', data.results || [], true);
  } else {
    buildGenreBar(type);
    const data  = await get('/movies', { type, limit: 300 });
    renderGrid(type === 'documentary' ? 'Documentales' : 'Películas', data.results || []);
  }
}

async function filterByGenre(genre, type = null) {
  const params = { genre, limit: 300 };
  if (type) params.type = type;
  const data = await get('/movies', params);
  renderGrid(genre, data.results || []);
}

async function doSearch(q) {
  setNavActive('');
  document.getElementById('genreBar').style.display = 'none';
  const data = await get('/movies', { search: q, limit: 100 });
  renderGrid(`"${q}"`, data.results || [], false, true);
}

async function showFavorites() {
  setNavActive('favorites');
  document.getElementById('genreBar').style.display = 'none';
  const items = await fetch('/api/user/favorites?list_type=favorite', { headers: auth() }).then(r => r.json());
  renderGrid('Favoritos', items);
}

async function showWatchlist() {
  setNavActive('watchlist');
  document.getElementById('genreBar').style.display = 'none';
  const items = await fetch('/api/user/favorites?list_type=watchlist', { headers: auth() }).then(r => r.json());
  renderGrid('Ver después', items);
}

function renderGrid(title, items, isSeries = false, isSearch = false) {
  const wrap = document.getElementById('sections');
  if (!items.length) {
    wrap.innerHTML = `<div class="empty"><h2>${title}</h2><p>No hay nada aquí todavía.</p><a href="#" onclick="renderHome();return false">Volver al inicio</a></div>`;
    return;
  }
  const count = isSearch ? ` <span>(${items.length} resultados)</span>` : '';
  wrap.innerHTML = `
    <div class="grid-view">
      <div class="grid-header"><h2>${title}${count}</h2></div>
      <div class="grid">${items.map(m => buildCard(m, isSeries)).join('')}</div>
    </div>`;
  wrap.querySelectorAll('.card').forEach(wireCard);
}

/* ── NAV LINKS ── */
document.getElementById('navLogo').addEventListener('click', () => { renderHome(); });
document.querySelectorAll('.nav-link').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const v = a.dataset.view;
    if (v === 'home')          renderHome();
    else if (v === 'movies')   filterByType('movie');
    else if (v === 'series')   filterByType('tv');
    else if (v === 'documentaries') filterByType('documentary');
    else if (v === 'favorites') showFavorites();
    else if (v === 'watchlist') showWatchlist();
  });
});

/* ── FAVORITES ── */
const favCache = new Map();
async function getFavState(id) {
  if (favCache.has(id)) return favCache.get(id);
  const r = await fetch(`/api/user/favorites/check/${id}`, { headers: auth() }).then(r => r.json()).catch(() => ({}));
  favCache.set(id, r); return r;
}
async function toggleFav(id, list) {
  const s = await getFavState(id);
  const on = list === 'favorite' ? s.is_favorite : s.in_watchlist;
  if (on) await fetch(`/api/user/favorites/${id}?list_type=${list}`, { method: 'DELETE', headers: auth() });
  else    await fetch('/api/user/favorites', { method: 'POST', headers: auth(), body: JSON.stringify({ movie_id: id, list_type: list }) });
  favCache.delete(id);
  const label = list === 'favorite' ? (on ? 'Eliminado de favoritos' : 'Añadido a favoritos') : (on ? 'Eliminado de lista de seguimiento' : 'Guardado para ver después');
  showToast(label);
  return !on;
}

/* ── DETAIL MODAL ── */
let currentTrailer = null;

async function showDetail(id) {
  openOverlay('detailOverlay');
  resetDetail();
  try {
    const [m, extras] = await Promise.all([
      get(`/movies/${id}`),
      fetch(`/api/movies/${id}/extras`, { headers: auth() }).then(r => r.json()).catch(() => ({})),
    ]);

    const bg = backdrop(m);
    if (bg) document.getElementById('detailBackdrop').style.backgroundImage = `url(${bg})`;

    const type = m.type === 'documentary' ? 'Documental' : m.type === 'tv' ? 'Serie' : 'Película';
    document.getElementById('detailEyebrow').textContent = type;
    document.getElementById('detailTitle').textContent   = m.title;
    document.getElementById('detailDesc').textContent    = m.description || 'Sin descripción disponible.';

    if (m.rating) {
      const pct = (Number(m.rating) / 10) * 100;
      document.getElementById('detailRating').innerHTML = `
        <span class="rating-num">${Number(m.rating).toFixed(1)}</span>
        <span class="rating-of">/10</span>
        <div class="rating-track"><div class="rating-track-fill" style="width:${pct}%"></div></div>`;
    }

    const playBtn = document.getElementById('detailPlay');
    playBtn.style.display = m.file_path ? 'flex' : 'none';
    playBtn.onclick = () => { closeOverlay('detailOverlay'); play(m.id, m.title); };

    const dir = extras.director || m.director || '';
    document.getElementById('detailMeta').innerHTML = [
      m.year     ? `<div class="detail-meta-row"><div class="detail-meta-label">Año</div><div class="detail-meta-value">${m.year}</div></div>` : '',
      m.duration ? `<div class="detail-meta-row"><div class="detail-meta-label">Duración</div><div class="detail-meta-value">${m.duration} min</div></div>` : '',
      m.genres   ? `<div class="detail-meta-row"><div class="detail-meta-label">Géneros</div><div class="detail-meta-value">${m.genres}</div></div>` : '',
      dir        ? `<div class="detail-meta-row"><div class="detail-meta-label">Director</div><div class="detail-meta-value">${dir}</div></div>` : '',
      m.cast     ? `<div class="detail-meta-row"><div class="detail-meta-label">Reparto</div><div class="detail-meta-value">${m.cast}</div></div>` : '',
      m.file_size? `<div class="detail-meta-row"><div class="detail-meta-label">Tamaño</div><div class="detail-meta-value">${(m.file_size/1e9).toFixed(1)} GB</div></div>` : '',
    ].filter(Boolean).join('');

    // Favorites
    const favBtn   = document.getElementById('detailFav');
    const laterBtn = document.getElementById('detailLater');
    getFavState(id).then(s => {
      favBtn.classList.toggle('fav-active',   s.is_favorite);
      laterBtn.classList.toggle('later-active', s.in_watchlist);
    });
    favBtn.onclick = async () => {
      const on = await toggleFav(id, 'favorite');
      favBtn.classList.toggle('fav-active', on);
    };
    laterBtn.onclick = async () => {
      const on = await toggleFav(id, 'watchlist');
      laterBtn.classList.toggle('later-active', on);
    };

    const identifyBtn = document.getElementById('detailIdentify');
    if (identifyBtn) {
      identifyBtn.style.display = isAdminUser ? 'flex' : 'none';
      identifyBtn.onclick = () => openMetadataMatch(id, m.title, m.type);
    }

    // Trailer
    currentTrailer = extras.trailer || null;
    const trailerBtn = document.getElementById('trailerBtn');
    trailerBtn.style.display = currentTrailer ? 'flex' : 'none';

    // Cast
    if (extras.cast?.length) {
      document.getElementById('castWrap').style.display = 'block';
      document.getElementById('castRow').innerHTML = extras.cast.map(a => {
        const ph = a.profile_path ? `https://image.tmdb.org/t/p/w185${a.profile_path}` : `https://placehold.co/86x86/2a2a2a/555?text=${encodeURIComponent(a.name?.[0] || '?')}`;
        return `<div class="cast-card" data-person="${a.id}"><img class="cast-photo" src="${ph}" loading="lazy" /><div class="cast-name">${escHtml(a.name)}</div>${a.character ? `<div class="cast-char">${escHtml(a.character)}</div>` : ''}</div>`;
      }).join('');
      document.querySelectorAll('.cast-card[data-person]').forEach(c => c.addEventListener('click', () => showPerson(+c.dataset.person)));
    }

    // Providers for the selected title
    renderProviders(extras.providers);

    // Similar
    if (extras.similar?.length) {
      document.getElementById('similarWrap').style.display = 'block';
      document.getElementById('similarRow').innerHTML = extras.similar.map(s => {
        const sp = s.poster_path ? `https://image.tmdb.org/t/p/w185${s.poster_path}` : `https://placehold.co/130x195/2a2a2a/555?text=${encodeURIComponent(s.title||'?')}`;
        const availability = !s.in_library && extras.providers ? providerLabel(extras.providers) : '';
        return `<div class="similar-card" data-id="${s.library_id||''}">${s.in_library ? '<span class="similar-in-lib">En biblioteca</span>' : '<span class="similar-out-lib">Fuera</span>'}<img src="${sp}" /><div class="similar-card-title">${escHtml(s.title)}</div>${s.rating ? `<div class="similar-card-rating">? ${Number(s.rating).toFixed(1)}</div>` : ''}${availability ? `<div class="similar-provider">${escHtml(availability)}</div>` : ''}</div>`;
      }).join('');
      document.querySelectorAll('.similar-card[data-id]').forEach(c => {
        if (c.dataset.id) c.addEventListener('click', () => showDetail(+c.dataset.id));
      });
    }

  } catch (e) { console.error(e); showToast('Error al cargar el contenido'); }
}


function providerLabel(providers) {
  const names = [...(providers?.flatrate || []), ...(providers?.rent || []), ...(providers?.buy || [])]
    .map(p => p.name).filter(Boolean);
  return names.length ? `Disponible en ${[...new Set(names)].slice(0, 3).join(', ')}` : 'Sin disponibilidad en España';
}
function renderProviders(providers) {
  const wrap = document.getElementById('providersWrap');
  const row = document.getElementById('providersRow');
  if (!wrap || !row) return;
  const groups = [
    ['Streaming', providers?.flatrate || []],
    ['Alquiler', providers?.rent || []],
    ['Compra', providers?.buy || []],
  ].filter(([, items]) => items.length);
  if (!groups.length) { wrap.style.display = 'none'; row.innerHTML = ''; return; }
  wrap.style.display = 'block';
  row.innerHTML = groups.map(([label, items]) => `
    <div class="provider-group"><span>${label}</span>${items.slice(0, 8).map(p => `
      <a class="provider-pill" href="${providers.link || '#'}" target="_blank" rel="noopener">
        ${p.logo_path ? `<img src="https://image.tmdb.org/t/p/w45${p.logo_path}" alt="${escAttr(p.name)}" />` : ''}${escHtml(p.name)}
      </a>`).join('')}</div>`).join('');
}

function setElText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function setElHtml(id, value) { const el = document.getElementById(id); if (el) el.innerHTML = value; }
function setElDisplay(id, value) { const el = document.getElementById(id); if (el) el.style.display = value; }
function clearElBg(id) { const el = document.getElementById(id); if (el) el.style.backgroundImage = ''; }

function resetDetail() {
  clearElBg('detailBackdrop');
  setElText('detailEyebrow', 'Cargando...');
  setElText('detailTitle', '');
  setElHtml('detailRating', '');
  setElText('detailDesc', '');
  setElHtml('detailMeta', '');
  setElDisplay('trailerWrap', 'none');
  const trailerFrame = document.getElementById('trailerFrame');
  if (trailerFrame) trailerFrame.src = '';
  setElDisplay('castWrap', 'none');
  setElDisplay('similarWrap', 'none');
  setElDisplay('providersWrap', 'none');
  setElDisplay('detailIdentify', 'none');
  setElHtml('castRow', '');
  setElHtml('similarRow', '');
  setElHtml('providersRow', '');
  currentTrailer = null;
}

document.getElementById('trailerBtn').addEventListener('click', () => {
  if (!currentTrailer) return;
  const wrap = document.getElementById('trailerWrap');
  document.getElementById('trailerFrame').src = `https://www.youtube.com/embed/${currentTrailer}?autoplay=1&rel=0`;
  wrap.style.display = 'block';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
document.getElementById('trailerDismiss').addEventListener('click', () => {
  document.getElementById('trailerWrap').style.display = 'none';
  document.getElementById('trailerFrame').src = '';
});

/* ── SERIES MODAL ── */
async function showSeriesModal(key) {
  openOverlay('seriesOverlay');

  const titleEl = document.getElementById('seriesTitle');
  const descEl = document.getElementById('seriesDesc');
  const metaEl = document.getElementById('seriesMeta');
  const backdropEl = document.getElementById('seriesBackdrop');
  const episodeList = document.getElementById('episodeList');
  const seasonSummary = document.getElementById('seasonSummary');
  const dropdown = document.getElementById('seasonDropdown');
  const dropdownBtn = document.getElementById('seasonDropdownBtn');
  const dropdownLabel = document.getElementById('seasonDropdownLabel');
  const dropdownMenu = document.getElementById('seasonDropdownMenu');

  titleEl.textContent = '...';
  descEl.textContent = '';
  metaEl.innerHTML = '';
  episodeList.innerHTML = '<p class="series-loading">Cargando...</p>';
  seasonSummary.textContent = 'Cargando temporadas...';
  dropdown?.classList.remove('open');
  if (dropdownBtn) dropdownBtn.setAttribute('aria-expanded', 'false');
  if (dropdownLabel) dropdownLabel.textContent = 'Temporada';
  if (dropdownMenu) dropdownMenu.innerHTML = '';

  try {
    const response = await fetch(`/api/series/${encodeURIComponent(key)}/seasons`, { headers: auth() });
    const data = await readJsonResponse(response, 'Error al cargar la serie');

    const bg = img(data.backdrop_path, 'original');
    backdropEl.style.backgroundImage = bg ? `url(${bg})` : '';
    titleEl.textContent = data.series_title || 'Serie';
    descEl.textContent = data.description || '';
    metaEl.innerHTML = [
      data.rating ? `<span class="series-meta-chip">&#9733; ${Number(data.rating).toFixed(1)}</span>` : '',
      data.year ? `<span>${escHtml(String(data.year))}</span>` : '',
      data.season_count ? `<span>${Number(data.season_count)} temporadas</span>` : '',
      `<span>${Number(data.episode_count || 0)} episodios</span>`,
    ].filter(Boolean).join('');

    // Favoritos/ver después para la serie usando el primer episodio como proxy hasta tener entidad serie propia.
    const firstEp = Object.values(data.seasons || {})[0]?.[0];
    const favBtn = document.getElementById('seriesFav');
    const laterBtn = document.getElementById('seriesLater');
    [favBtn, laterBtn].forEach(btn => {
      if (!btn) return;
      btn.classList.remove('fav-active', 'later-active');
      btn.disabled = false;
      btn.onclick = null;
    });
    if (firstEp) {
      getFavState(firstEp.id).then(s => {
        favBtn?.classList.toggle('fav-active', !!s.is_favorite);
        laterBtn?.classList.toggle('later-active', !!s.in_watchlist);
      });
      favBtn.onclick = async event => {
        event.preventDefault();
        event.stopPropagation();
        const on = await toggleFav(firstEp.id, 'favorite');
        favBtn.classList.toggle('fav-active', on);
        showToast(on ? 'Serie añadida a favoritos' : 'Serie quitada de favoritos');
      };
      laterBtn.onclick = async event => {
        event.preventDefault();
        event.stopPropagation();
        const on = await toggleFav(firstEp.id, 'watchlist');
        laterBtn.classList.toggle('later-active', on);
        showToast(on ? 'Serie añadida a ver después' : 'Serie quitada de ver después');
      };
    } else {
      favBtn.disabled = true;
      laterBtn.disabled = true;
    }

    const identifyBtn = document.getElementById('seriesIdentify');
    if (identifyBtn) {
      identifyBtn.style.display = isAdminUser ? 'inline-flex' : 'none';
      identifyBtn.onclick = async event => {
        event.preventDefault();
        event.stopPropagation();
        identifyBtn.disabled = true;
        identifyBtn.textContent = 'Identificando...';
        try {
          const r = await fetch(`/api/series/${encodeURIComponent(key)}/refresh-metadata`, {
            method: 'POST',
            headers: auth(),
          });
          await readJsonResponse(r, 'Error identificando episodios');
          favCache.clear();
          showToast('Metadatos de episodios actualizados');
          showSeriesModal(key);
        } catch (err) {
          showToast(err.message || 'Error identificando episodios');
        } finally {
          identifyBtn.disabled = false;
          identifyBtn.textContent = 'Identificar episodios';
        }
      };
    }

    const seasons = Object.keys(data.seasons || {}).sort((a, b) => +a - +b);
    let activeSeason = seasons[0] || '';

    function closeSeasonDropdown() {
      dropdown?.classList.remove('open');
      dropdownBtn?.setAttribute('aria-expanded', 'false');
    }

    function renderSeasonMenu() {
      if (!dropdownMenu) return;
      dropdownMenu.innerHTML = seasons.map(sn => {
        const count = data.seasons[sn]?.length || 0;
        const active = String(sn) === String(activeSeason) ? ' active' : '';
        return `<button type="button" class="season-option${active}" data-season="${escHtml(String(sn))}" role="option" aria-selected="${active ? 'true' : 'false'}">
          <span>Temporada ${escHtml(String(sn))}</span>
          <small>${count} episodios</small>
        </button>`;
      }).join('');
      dropdownMenu.querySelectorAll('.season-option').forEach(option => {
        option.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          showSeason(option.dataset.season);
          closeSeasonDropdown();
        });
      });
    }

    dropdownBtn.onclick = event => {
      event.preventDefault();
      event.stopPropagation();
      dropdown?.classList.toggle('open');
      dropdownBtn.setAttribute('aria-expanded', dropdown?.classList.contains('open') ? 'true' : 'false');
    };
    if (!window.__lupeflixSeasonDropdownOutsideBound) {
      document.addEventListener('click', event => {
        const d = document.getElementById('seasonDropdown');
        if (d && !d.contains(event.target)) {
          d.classList.remove('open');
          document.getElementById('seasonDropdownBtn')?.setAttribute('aria-expanded', 'false');
        }
      });
      window.__lupeflixSeasonDropdownOutsideBound = true;
    }

    function showSeason(sn) {
      activeSeason = String(sn);
      const eps = data.seasons[activeSeason] || [];
      if (dropdownLabel) dropdownLabel.textContent = `Temporada ${activeSeason}`;
      seasonSummary.textContent = `${eps.length} episodios disponibles en la temporada ${activeSeason}`;
      renderSeasonMenu();

      episodeList.innerHTML = eps.map(ep => {
        const th = ep.poster_path ? img(ep.poster_path, 'w300') : `https://placehold.co/142x80/2a2a2a/777?text=E${ep.episode_number || '?'}`;
        const num = ep.episode_number ? String(ep.episode_number).padStart(2, '0') : '??';
        const meta = [
          ep.duration ? `${ep.duration} min` : '',
          (ep.episode_air_date || ep.air_date) ? `<span class="ep-air-date">${escHtml(ep.episode_air_date || ep.air_date)}</span>` : '',
        ].filter(Boolean).join(' · ');
        return `
          <div class="episode-item" data-id="${ep.id}">
            <div class="ep-num">${num}</div>
            <img class="ep-thumb" src="${th}" loading="lazy" alt="${escHtml(ep.episode_title || `Episodio ${num}`)}" />
            <div class="ep-body">
              <div class="ep-title">${escHtml(ep.episode_title || `Episodio ${num}`)}</div>
              ${ep.description ? `<div class="ep-desc">${escHtml(ep.description)}</div>` : ''}
              ${meta ? `<div class="ep-meta">${meta}</div>` : ''}
            </div>
            ${ep.file_path ? `<button type="button" class="ep-play-btn" data-id="${ep.id}" aria-label="Reproducir episodio"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg></button>` : '<span></span>'}
          </div>`;
      }).join('');

      episodeList.querySelectorAll('.episode-item').forEach(item => {
        item.addEventListener('click', event => {
          if (event.target.closest('button')) return;
          closeOverlay('seriesOverlay');
          play(+item.dataset.id, item.querySelector('.ep-title')?.textContent || '');
        });
      });
      episodeList.querySelectorAll('.ep-play-btn').forEach(btn => {
        btn.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          closeOverlay('seriesOverlay');
          play(+btn.dataset.id, '');
        });
      });
    }

    renderSeasonMenu();
    if (seasons.length) showSeason(activeSeason);
    else {
      seasonSummary.textContent = 'No hay episodios disponibles todavía';
      episodeList.innerHTML = '<p class="series-loading">No hay episodios disponibles.</p>';
    }

  } catch (e) {
    console.error(e);
    document.getElementById('seasonSummary').textContent = 'No se pudo cargar esta serie';
    document.getElementById('episodeList').innerHTML = '<p class="series-loading">Error al cargar la serie.</p>';
    showToast('Error al cargar la serie');
  }
}

/* OVERLAYS */


let metadataTarget = null;
async function openMetadataMatch(id, title, type = 'movie') {
  const targetType = type === 'tv' ? 'tv' : (type === 'documentary' ? 'documentary' : 'movie');
  metadataTarget = { id, title, type: targetType };
  openOverlay('metadataOverlay');
  const q = document.getElementById('metadataQuery');
  const t = document.getElementById('metadataType');
  const results = document.getElementById('metadataResults');
  if (q) q.value = title || '';
  if (t) t.value = metadataTarget.type;
  if (results) results.innerHTML = '';
  await searchMetadataMatches();
}
async function searchMetadataMatches() {
  if (!metadataTarget) return;
  const q = document.getElementById('metadataQuery')?.value.trim();
  const type = document.getElementById('metadataType')?.value || metadataTarget.type;
  const results = document.getElementById('metadataResults');
  if (!q || !results) return;
  results.innerHTML = '<p class="metadata-help">Buscando...</p>';
  try {
    const data = await fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=${type}`).then(r => r.json());
    if (!data.results?.length) {
      results.innerHTML = '<p class="metadata-help">Sin resultados. Prueba con el t?tulo original.</p>';
      return;
    }
    results.innerHTML = data.results.slice(0, 12).map(item => {
      const title = item.title || item.name || '';
      const year = (item.release_date || item.first_air_date || '').slice(0, 4);
      const poster = item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : `https://placehold.co/90x135/222/555?text=${encodeURIComponent(title || '?')}`;
      const lookupType = item.media_type === 'tv' ? 'tv' : (type === 'tv' ? 'tv' : 'movie');
      const saveType = type === 'documentary' ? 'documentary' : lookupType;
      const badge = type === 'documentary'
        ? (lookupType === 'tv' ? 'Documental TV' : 'Documental')
        : (lookupType === 'tv' ? 'Serie' : 'Pel?cula');
      return `<button class="metadata-card" data-tmdb="${item.id}" data-type="${lookupType}" data-save-type="${saveType}"><img src="${poster}" /><span><strong>${escHtml(title)}</strong><small>${escHtml(badge)} ? ${year || 'Sin a?o'} ? ${Number(item.vote_average || 0).toFixed(1)}/10</small></span></button>`;
    }).join('');
    results.querySelectorAll('.metadata-card').forEach(btn => {
      btn.addEventListener('click', () => applyMetadataMatch(btn.dataset.tmdb, btn.dataset.type, btn.dataset.saveType));
    });
  } catch (e) {
    console.error(e);
    results.innerHTML = '<p class="metadata-help">Error buscando en TMDB.</p>';
  }
}
async function applyMetadataMatch(tmdbId, type, saveType = null) {
  if (!metadataTarget) return;
  const results = document.getElementById('metadataResults');
  if (results) results.innerHTML = '<p class="metadata-help">Aplicando metadatos...</p>';
  try {
    await fetch(`/api/rematch/${metadataTarget.id}/identify`, {
      method: 'POST',
      headers: auth(),
      body: JSON.stringify({ tmdb_id: Number(tmdbId), type, save_type: saveType }),
    }).then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Error identificando'); return r.json(); });
    closeOverlay('metadataOverlay');
    showToast('Metadatos actualizados');
    showDetail(metadataTarget.id);
  } catch (e) { console.error(e); if (results) results.innerHTML = `<p class="metadata-help">${escHtml(e.message)}</p>`; }
}
async function showPerson(personId) {
  openOverlay('personOverlay');
  document.getElementById('personName').textContent = 'Cargando...';
  document.getElementById('personBio').textContent = '';
  document.getElementById('personMeta').innerHTML = '';
  document.getElementById('personCredits').innerHTML = '';
  document.getElementById('personPhoto').src = 'https://placehold.co/220x330/1f1f1f/555?text=?';
  try {
    const data = await fetch(`/api/movies/person/${personId}`, { headers: auth() }).then(r => r.json());
    if (data.error) throw new Error(data.error);
    const p = data.person || {};
    document.getElementById('personName').textContent = p.name || '';
    document.getElementById('personPhoto').src = p.profile_path ? `https://image.tmdb.org/t/p/w342${p.profile_path}` : 'https://placehold.co/220x330/1f1f1f/555?text=?';
    document.getElementById('personBio').textContent = p.biography || 'Biograf?a no disponible.';
    document.getElementById('personMeta').innerHTML = [
      p.birthday ? `<span>Nacimiento: ${p.birthday}</span>` : '',
      p.place_of_birth ? `<span>${escHtml(p.place_of_birth)}</span>` : '',
      p.known_for_department ? `<span>${escHtml(p.known_for_department)}</span>` : '',
    ].filter(Boolean).join('');
    document.getElementById('personCredits').innerHTML = (data.credits || []).map(c => {
      const sp = c.poster_path ? `https://image.tmdb.org/t/p/w185${c.poster_path}` : `https://placehold.co/130x195/2a2a2a/555?text=${encodeURIComponent(c.title||'?')}`;
      return `<div class="similar-card" data-id="${c.library_id || ''}">${c.in_library ? '<span class="similar-in-lib">En biblioteca</span>' : '<span class="similar-out-lib">Info</span>'}<img src="${sp}" /><div class="similar-card-title">${escHtml(c.title)}</div>${c.character ? `<div class="similar-card-rating">${escHtml(c.character)}</div>` : ''}</div>`;
    }).join('');
    document.querySelectorAll('#personCredits .similar-card[data-id]').forEach(c => {
      if (c.dataset.id) c.addEventListener('click', () => { closeOverlay('personOverlay'); showDetail(+c.dataset.id); });
    });
  } catch (e) { console.error(e); showToast('Error al cargar actor'); closeOverlay('personOverlay'); }
}

function openOverlay(id)  { document.getElementById(id)?.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeOverlay(id) { document.getElementById(id)?.classList.remove('open'); document.body.style.overflow = ''; }

document.getElementById('detailClose')?.addEventListener('click', () => closeOverlay('detailOverlay'));
document.getElementById('seriesClose')?.addEventListener('click', () => closeOverlay('seriesOverlay'));
document.getElementById('personClose')?.addEventListener('click', () => closeOverlay('personOverlay'));
document.getElementById('metadataClose')?.addEventListener('click', () => closeOverlay('metadataOverlay'));
document.getElementById('metadataSearchBtn')?.addEventListener('click', searchMetadataMatches);
document.getElementById('metadataQuery')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchMetadataMatches(); });
document.getElementById('detailOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay('detailOverlay'); });
document.getElementById('seriesOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay('seriesOverlay'); });
document.getElementById('personOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay('personOverlay'); });
document.getElementById('metadataOverlay')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeOverlay('metadataOverlay'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeOverlay('detailOverlay'); closeOverlay('seriesOverlay'); closeOverlay('personOverlay'); closeOverlay('metadataOverlay'); closePlayer(); } });

/* ── PLAYER ── */
let progressInterval, playerUiInterval, currentPlaybackId = null, currentNextEpisode = null;
async function play(id, title) {
  currentPlaybackId = id;
  currentNextEpisode = null;
  document.getElementById('playerTitle').textContent = title;
  const vid = document.getElementById('videoEl');
  vid.src = `/stream/${id}`;
  document.getElementById('player').style.display = 'flex';
  document.body.style.overflow = 'hidden';

  fetch(`/api/movies/${id}/next`, { headers: auth() }).then(r => r.json()).then(d => { currentNextEpisode = d.next || null; }).catch(() => {});

  const skipBtn = document.getElementById('skipIntroBtn');
  const nextBtn = document.getElementById('nextEpisodeBtn');
  skipBtn.style.display = 'none';
  nextBtn.style.display = 'none';
  skipBtn.onclick = () => { vid.currentTime = Math.min((vid.currentTime || 0) + 90, Math.max((vid.duration || 0) - 5, 0)); skipBtn.style.display = 'none'; };
  nextBtn.onclick = () => { if (currentNextEpisode) play(currentNextEpisode.id, currentNextEpisode.episode_title || currentNextEpisode.title); };

  clearInterval(progressInterval);
  clearInterval(playerUiInterval);
  progressInterval = setInterval(() => {
    if (!vid.paused && !isNaN(vid.duration)) {
      fetch('/api/user/history', { method: 'POST', headers: auth(), body: JSON.stringify({ movie_id: id, progress: Math.floor(vid.currentTime), duration: Math.floor(vid.duration) }) }).catch(() => {});
    }
  }, 12000);
  playerUiInterval = setInterval(() => {
    if (isNaN(vid.duration) || !vid.duration) return;
    skipBtn.style.display = vid.currentTime > 15 && vid.currentTime < 180 ? 'block' : 'none';
    nextBtn.style.display = currentNextEpisode && (vid.duration - vid.currentTime) < 90 ? 'block' : 'none';
  }, 1000);

  vid.onended = () => {
    clearInterval(progressInterval);
    clearInterval(playerUiInterval);
    fetch('/api/user/history', { method: 'POST', headers: auth(), body: JSON.stringify({ movie_id: id, progress: Math.floor(vid.duration || 0), duration: Math.floor(vid.duration || 0) }) }).catch(() => {});
    if (currentNextEpisode) play(currentNextEpisode.id, currentNextEpisode.episode_title || currentNextEpisode.title);
  };
}
document.getElementById('playerClose').addEventListener('click', closePlayer);
function closePlayer() {
  clearInterval(progressInterval);
  clearInterval(playerUiInterval);
  const vid = document.getElementById('videoEl');
  vid.pause(); vid.src = '';
  document.getElementById('player').style.display = 'none';
  document.body.style.overflow = '';
}

/* ── TOAST ── */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ── INIT ── */
loadHero();
renderHome();
