const SESSION_KEY = 'lupeflix_session';
const API_KEY = '2dca580c2a14b55200e784d157207b4d';
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

// ── AUTH GUARD ──
const session = JSON.parse(localStorage.getItem(SESSION_KEY));
if (!session) { window.location.href = 'index.html'; }

// ── USER UI ──
document.getElementById('userName').textContent = session.name;
document.getElementById('userAvatar').textContent = session.name.charAt(0).toUpperCase();
document.getElementById('logoutBtn').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
});

// ── NAVBAR SCROLL ──
window.addEventListener('scroll', () => {
  document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 40);
});

// ── SEARCH ──
const searchToggle = document.getElementById('searchToggle');
const searchBar = document.getElementById('searchBar');
const searchInput = document.getElementById('searchInput');

searchToggle.addEventListener('click', () => {
  searchBar.classList.toggle('open');
  if (searchBar.classList.contains('open')) searchInput.focus();
});

let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    const q = searchInput.value.trim();
    if (q.length > 2) searchMovies(q);
    else if (q.length === 0) renderHome();
  }, 400);
});

// ── API ──
async function api(path, params = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('language', 'es-MX');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function imgUrl(path, size = 'w500') {
  return path ? `${IMG}/${size}${path}` : 'https://via.placeholder.com/500x750/0f0f1e/444?text=Sin+imagen';
}

// ── HERO ──
let heroItems = [];
let heroIndex = 0;
let heroTimer;

async function loadHero() {
  const [movies, series] = await Promise.all([
    api('/trending/movie/week'),
    api('/trending/tv/week')
  ]);
  heroItems = [...movies.results.slice(0, 4), ...series.results.slice(0, 3)];
  renderHero(0);

  const dots = document.getElementById('heroDots');
  dots.innerHTML = heroItems.map((_, i) =>
    `<div class="hero-dot ${i === 0 ? 'active' : ''}" data-i="${i}"></div>`
  ).join('');
  dots.querySelectorAll('.hero-dot').forEach(d => {
    d.addEventListener('click', () => setHero(+d.dataset.i));
  });

  startHeroTimer();
}

function renderHero(i) {
  const item = heroItems[i];
  const isMovie = !!item.title;
  const title = item.title || item.name;
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);

  document.getElementById('heroBg').style.backgroundImage =
    `url(${imgUrl(item.backdrop_path, 'original')})`;
  document.getElementById('heroBadge').textContent = isMovie ? 'PELÍCULA' : 'SERIE';
  document.getElementById('heroTitle').textContent = title;
  document.getElementById('heroMeta').innerHTML =
    `<span>⭐ ${item.vote_average?.toFixed(1)}</span><span>${year}</span>`;
  document.getElementById('heroDesc').textContent = item.overview || '';

  document.getElementById('heroPlay').onclick = () => showModal(item.id, isMovie ? 'movie' : 'tv');
  document.getElementById('heroInfo').onclick = () => showModal(item.id, isMovie ? 'movie' : 'tv');

  document.querySelectorAll('.hero-dot').forEach((d, idx) => {
    d.classList.toggle('active', idx === i);
  });

  heroIndex = i;
}

function setHero(i) {
  clearInterval(heroTimer);
  renderHero(i);
  startHeroTimer();
}

function startHeroTimer() {
  heroTimer = setInterval(() => {
    renderHero((heroIndex + 1) % heroItems.length);
  }, 6000);
}

// ── SECTIONS ──
const SECTIONS = [
  { title: '🔥 Tendencias Hoy', icon: '', endpoint: '/trending/all/day', type: 'all' },
  { title: '🏆 Top 10 esta semana', icon: '', endpoint: '/trending/movie/week', type: 'movie', top10: true },
  { title: '🎬 Películas Populares', icon: '', endpoint: '/movie/popular', type: 'movie' },
  { title: '📺 Series Populares', icon: '', endpoint: '/tv/popular', type: 'tv' },
  { title: '⭐ Mejor Valoradas', icon: '', endpoint: '/movie/top_rated', type: 'movie' },
  { title: '🆕 Estrenos', icon: '', endpoint: '/movie/now_playing', type: 'movie' },
  { title: '🤖 Ciencia Ficción', icon: '', endpoint: '/discover/movie', type: 'movie', params: { with_genres: 878 } },
  { title: '💀 Terror', icon: '', endpoint: '/discover/movie', type: 'movie', params: { with_genres: 27 } },
];

async function renderHome() {
  const container = document.getElementById('sectionsContainer');
  container.innerHTML = '';
  SECTIONS.forEach(s => container.appendChild(buildSkeletonSection(s.title)));

  for (let i = 0; i < SECTIONS.length; i++) {
    const s = SECTIONS[i];
    try {
      const data = await api(s.endpoint, s.params || {});
      const el = container.children[i];
      el.innerHTML = buildSection(s, data.results.slice(0, 16));
      attachCarouselBtns(el);
      el.querySelectorAll('.card').forEach(c => {
        c.addEventListener('click', () => showModal(+c.dataset.id, c.dataset.type));
      });
    } catch {}
  }
}

function buildSkeletonSection(title) {
  const section = document.createElement('div');
  section.className = 'section';
  const skels = Array(8).fill('<div class="card-skeleton skeleton"></div>').join('');
  section.innerHTML = `
    <div class="section-header">
      <div class="section-title">${title}</div>
    </div>
    <div class="carousel-wrapper">
      <div class="carousel-track">${skels}</div>
    </div>`;
  return section;
}

function buildSection(s, items) {
  const cards = items.map((item, idx) => buildCard(item, s, idx)).join('');
  return `
    <div class="section-header">
      <div class="section-title">${s.title}</div>
      <a href="#" class="section-link">Ver más ›</a>
    </div>
    <div class="carousel-wrapper">
      <button class="carousel-btn prev" aria-label="Anterior">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15,18 9,12 15,6"/></svg>
      </button>
      <div class="carousel-track">${cards}</div>
      <button class="carousel-btn next" aria-label="Siguiente">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,18 15,12 9,6"/></svg>
      </button>
    </div>`;
}

function buildCard(item, s, idx) {
  const isMovie = item.media_type === 'movie' || s.type === 'movie';
  const type = item.media_type || (isMovie ? 'movie' : 'tv');
  const title = item.title || item.name || '';
  const year = (item.release_date || item.first_air_date || '').slice(0, 4);
  const rating = item.vote_average?.toFixed(1) || '–';
  const poster = imgUrl(item.poster_path);
  const typeLabel = type === 'movie' ? 'FILM' : 'SERIE';
  const top10Num = s.top10 ? `<div class="card-top-number">${idx + 1}</div>` : '';
  const cardClass = s.top10 ? 'card card-top' : 'card';

  return `
    <div class="${cardClass}" data-id="${item.id}" data-type="${type}">
      ${top10Num}
      <img src="${poster}" alt="${title}" loading="lazy" />
      <div class="card-year">${year}</div>
      <div class="card-type">${typeLabel}</div>
      <div class="card-overlay">
        <div class="card-title">${title}</div>
        <div class="card-rating">⭐ ${rating}</div>
      </div>
    </div>`;
}

function attachCarouselBtns(section) {
  const track = section.querySelector('.carousel-track');
  section.querySelector('.carousel-btn.prev')?.addEventListener('click', () => {
    track.scrollBy({ left: -500, behavior: 'smooth' });
  });
  section.querySelector('.carousel-btn.next')?.addEventListener('click', () => {
    track.scrollBy({ left: 500, behavior: 'smooth' });
  });
}

// ── MODAL ──
async function showModal(id, type) {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  try {
    const item = await api(`/${type}/${id}`);
    const title = item.title || item.name;
    const year = (item.release_date || item.first_air_date || '').slice(0, 4);
    const rating = item.vote_average?.toFixed(1);
    const runtime = item.runtime ? `${item.runtime} min` : (item.episode_run_time?.[0] ? `${item.episode_run_time[0]} min/ep` : '');
    const genres = item.genres?.map(g => g.name).join(', ') || '';

    document.getElementById('modalHero').style.backgroundImage =
      `url(${imgUrl(item.backdrop_path, 'original')})`;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalDesc').textContent = item.overview || 'Sin descripción disponible.';
    document.getElementById('modalMeta').innerHTML = `
      <span class="rating">⭐ ${rating}</span>
      <span>${year}</span>
      ${runtime ? `<span>${runtime}</span>` : ''}
      <span>${type === 'movie' ? 'Película' : 'Serie'}</span>
    `;
    document.getElementById('modalDetails').innerHTML = `
      <div><div class="label">Géneros</div><div class="value">${genres || '–'}</div></div>
      ${item.status ? `<div><div class="label">Estado</div><div class="value">${item.status}</div></div>` : ''}
      ${item.number_of_seasons ? `<div><div class="label">Temporadas</div><div class="value">${item.number_of_seasons}</div></div>` : ''}
      ${item.budget > 0 ? `<div><div class="label">Presupuesto</div><div class="value">$${(item.budget/1e6).toFixed(0)}M</div></div>` : ''}
    `;
  } catch {
    showToast('Error al cargar el contenido.');
  }
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

// ── SEARCH ──
async function searchMovies(query) {
  const container = document.getElementById('sectionsContainer');
  container.innerHTML = `<div class="search-results">
    <div class="search-results-title">Resultados para: <span>"${query}"</span></div>
    <div class="search-grid" id="searchGrid">
      ${Array(8).fill('<div class="card-skeleton skeleton" style="aspect-ratio:2/3"></div>').join('')}
    </div>
  </div>`;

  try {
    const [movies, series] = await Promise.all([
      api('/search/movie', { query }),
      api('/search/tv', { query })
    ]);

    const results = [
      ...movies.results.map(i => ({ ...i, _type: 'movie' })),
      ...series.results.map(i => ({ ...i, _type: 'tv' }))
    ].sort((a, b) => b.popularity - a.popularity).slice(0, 24);

    const grid = document.getElementById('searchGrid');
    if (!grid) return;

    if (results.length === 0) {
      grid.innerHTML = '<p style="color:var(--muted);grid-column:1/-1">No se encontraron resultados.</p>';
      return;
    }

    grid.innerHTML = results.map(item => buildCard(item, { type: item._type }, 0)).join('');
    grid.querySelectorAll('.card').forEach(c => {
      c.addEventListener('click', () => showModal(+c.dataset.id, c.dataset.type));
    });
  } catch {
    showToast('Error en la búsqueda.');
  }
}

// ── GENRE FILTER ──
document.querySelectorAll('[data-genre]').forEach(a => {
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const genre = a.dataset.genre;
    const label = a.textContent;
    const container = document.getElementById('sectionsContainer');
    container.innerHTML = buildSkeletonSection(`🎭 ${label}`).outerHTML;
    try {
      const data = await api('/discover/movie', { with_genres: genre, sort_by: 'popularity.desc' });
      container.innerHTML = '';
      const section = document.createElement('div');
      section.className = 'section';
      section.innerHTML = buildSection({ title: `🎭 ${label}`, type: 'movie' }, data.results.slice(0, 20));
      container.appendChild(section);
      attachCarouselBtns(section);
      section.querySelectorAll('.card').forEach(c => {
        c.addEventListener('click', () => showModal(+c.dataset.id, c.dataset.type));
      });
    } catch {}
  });
});

// ── TYPE FILTER ──
document.querySelectorAll('[data-filter]').forEach(a => {
  a.addEventListener('click', async (e) => {
    e.preventDefault();
    const filter = a.dataset.filter;
    const isMovies = filter === 'movies';
    const container = document.getElementById('sectionsContainer');

    const endpoints = isMovies
      ? [
          { title: '🎬 Películas Populares', endpoint: '/movie/popular', type: 'movie' },
          { title: '⭐ Mejor Valoradas', endpoint: '/movie/top_rated', type: 'movie' },
          { title: '🆕 Estrenos', endpoint: '/movie/now_playing', type: 'movie' },
        ]
      : [
          { title: '📺 Series Populares', endpoint: '/tv/popular', type: 'tv' },
          { title: '⭐ Series Mejor Valoradas', endpoint: '/tv/top_rated', type: 'tv' },
          { title: '📡 En Emisión', endpoint: '/tv/on_the_air', type: 'tv' },
        ];

    container.innerHTML = '';
    endpoints.forEach(s => container.appendChild(buildSkeletonSection(s.title)));

    for (let i = 0; i < endpoints.length; i++) {
      const s = endpoints[i];
      try {
        const data = await api(s.endpoint);
        const el = container.children[i];
        el.innerHTML = buildSection(s, data.results.slice(0, 16));
        attachCarouselBtns(el);
        el.querySelectorAll('.card').forEach(c => {
          c.addEventListener('click', () => showModal(+c.dataset.id, c.dataset.type));
        });
      } catch {}
    }
  });
});

// ── TOAST ──
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── INIT ──
loadHero();
renderHome();
