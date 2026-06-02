const TOKEN_KEY   = 'lupeflix_token';
const SESSION_KEY = 'lupeflix_session';

const token   = localStorage.getItem(TOKEN_KEY);
const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
if (!token || !session) { window.location.href = 'index.html'; }

const H = { 'x-user-token': token, 'Content-Type': 'application/json' };

function imgUrl(p, size = 'w185') {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  return `https://image.tmdb.org/t/p/${size}${p}`;
}
function posterSrc(m) { return imgUrl(m.poster_path) || `https://placehold.co/140x210/0f0f1e/333?text=${encodeURIComponent(m.title||'?')}`; }

// ── INIT ──
async function init() {
  // Set user info
  document.getElementById('profileName').textContent  = session.name;
  document.getElementById('profileEmail').textContent = session.email;

  const av = document.getElementById('userAvatar');
  const avBig = document.getElementById('avatarBig');
  if (session.picture) {
    av.style.backgroundImage = avBig.style.backgroundImage = `url(${session.picture})`;
    av.style.backgroundSize = avBig.style.backgroundSize = 'cover';
    av.textContent = avBig.textContent = '';
  } else {
    const letter = session.name.charAt(0).toUpperCase();
    av.textContent = avBig.textContent = letter;
  }

  // Load settings
  try {
    const s = await fetch('/api/user/settings', { headers: H }).then(r => r.json());
    document.getElementById('settingName').value = s.display_name || session.name;
    document.getElementById('autoplayToggle').checked = !!s.autoplay;
    if (s.avatar_color) {
      document.getElementById('avatarColorInput').value = s.avatar_color;
      avBig.style.background = s.avatar_color;
      document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.toggle('active', sw.dataset.color === s.avatar_color));
    }
  } catch {}

  // Tab from hash
  const hash = location.hash.replace('#', '') || 'settings';
  openTab(hash);
}

// ── TABS ──
document.querySelectorAll('.tab-link').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    openTab(link.dataset.tab);
  });
});

function openTab(tab) {
  document.querySelectorAll('.tab-link').forEach(l => l.classList.toggle('active', l.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
  history.replaceState(null, '', `#${tab}`);
  if (tab === 'favorites')  loadFavorites();
  if (tab === 'watchlist')  loadWatchlist();
  if (tab === 'history')    loadHistory();
}

// ── COLOR SWATCHES ──
document.querySelectorAll('.color-swatch').forEach(sw => {
  sw.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    sw.classList.add('active');
    document.getElementById('avatarColorInput').value = sw.dataset.color;
    document.getElementById('avatarBig').style.background = sw.dataset.color;
  });
});

// ── SETTINGS FORM ──
document.getElementById('settingsForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msgEl = document.getElementById('settingsMsg');
  const body = {
    display_name:  document.getElementById('settingName').value.trim(),
    avatar_color:  document.getElementById('avatarColorInput').value,
    autoplay:      document.getElementById('autoplayToggle').checked,
    language:      'es',
  };
  try {
    await fetch('/api/user/settings', { method: 'PUT', headers: H, body: JSON.stringify(body) });
    // Update session name
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    s.name = body.display_name || s.name;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    document.getElementById('profileName').textContent = s.name;
    msgEl.className = 'success-msg'; msgEl.textContent = '✓ Cambios guardados'; msgEl.style.display = 'block';
    setTimeout(() => { msgEl.style.display = 'none'; }, 3000);
  } catch {
    msgEl.className = 'error-msg'; msgEl.textContent = 'Error al guardar'; msgEl.style.display = 'block';
  }
});

// ── FAVORITES ──
async function loadFavorites() {
  const grid = document.getElementById('favGrid');
  grid.innerHTML = '<p class="empty-msg">Cargando...</p>';
  try {
    const items = await fetch('/api/user/favorites?list_type=favorite', { headers: H }).then(r => r.json());
    renderMediaGrid(grid, items, 'favorite');
  } catch { grid.innerHTML = '<p class="empty-msg">Error al cargar</p>'; }
}

// ── WATCHLIST ──
async function loadWatchlist() {
  const grid = document.getElementById('watchlistGrid');
  grid.innerHTML = '<p class="empty-msg">Cargando...</p>';
  try {
    const items = await fetch('/api/user/favorites?list_type=watchlist', { headers: H }).then(r => r.json());
    renderMediaGrid(grid, items, 'watchlist');
  } catch { grid.innerHTML = '<p class="empty-msg">Error al cargar</p>'; }
}

function renderMediaGrid(container, items, listType) {
  if (!items.length) { container.innerHTML = '<p class="empty-msg">No hay nada aquí todavía.</p>'; return; }
  container.innerHTML = items.map(m => `
    <div class="media-card">
      <img src="${posterSrc(m)}" alt="${m.title}" loading="lazy" />
      <button class="media-card-remove" data-id="${m.id}" data-list="${listType}" title="Eliminar">✕</button>
      <div class="media-card-title">${m.title}</div>
      <div class="media-card-year">${m.year || ''}</div>
    </div>`).join('');

  container.querySelectorAll('.media-card-remove').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await fetch(`/api/user/favorites/${btn.dataset.id}?list_type=${btn.dataset.list}`, { method: 'DELETE', headers: H });
      btn.closest('.media-card').remove();
      if (!container.querySelector('.media-card')) container.innerHTML = '<p class="empty-msg">No hay nada aquí todavía.</p>';
    });
  });
}

// ── HISTORY ──
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<p class="empty-msg">Cargando...</p>';
  try {
    const items = await fetch('/api/user/history', { headers: H }).then(r => r.json());
    if (!items.length) { list.innerHTML = '<p class="empty-msg">No has visto nada todavía.</p>'; return; }
    list.innerHTML = items.map(m => {
      const pct = m.h_duration > 0 ? Math.round((m.progress / m.h_duration) * 100) : 0;
      const date = new Date(m.watched_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      return `
        <div class="history-item">
          <img class="history-poster" src="${posterSrc(m)}" alt="${m.title}" />
          <div class="history-info">
            <div class="history-title">${m.title} ${m.year ? `(${m.year})` : ''}</div>
            <div class="history-meta">${date} · ${m.completed ? '✓ Completada' : `${pct}% visto`}</div>
            <div class="history-progress"><div class="history-progress-fill" style="width:${pct}%"></div></div>
          </div>
          <button class="history-remove" data-id="${m.id}" title="Eliminar del historial">🗑</button>
        </div>`;
    }).join('');

    list.querySelectorAll('.history-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        await fetch(`/api/user/history/${btn.dataset.id}`, { method: 'DELETE', headers: H });
        btn.closest('.history-item').remove();
        if (!list.querySelector('.history-item')) list.innerHTML = '<p class="empty-msg">No has visto nada todavía.</p>';
      });
    });
  } catch { list.innerHTML = '<p class="empty-msg">Error al cargar</p>'; }
}

document.getElementById('clearHistoryBtn').addEventListener('click', async () => {
  if (!confirm('¿Eliminar todo el historial?')) return;
  const items = await fetch('/api/user/history', { headers: H }).then(r => r.json());
  await Promise.all(items.map(m => fetch(`/api/user/history/${m.id}`, { method: 'DELETE', headers: H })));
  loadHistory();
});

init();
