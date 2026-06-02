const SESSION_KEY = 'lupeflix_session';
const TOKEN_KEY   = 'lupeflix_token';

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Already logged in?
if (localStorage.getItem(TOKEN_KEY)) window.location.href = 'home.html';

// ── GOOGLE OAUTH ──
async function initGoogle() {
  try {
    const cfg = await fetch('/api/auth/config').then(r => r.json());
    if (!cfg.google_client_id) return;

    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });

    google.accounts.id.initialize({
      client_id: cfg.google_client_id,
      callback: handleGoogleLogin,
    });
    google.accounts.id.renderButton(document.getElementById('googleBtn'), {
      theme: 'filled_black', size: 'large', width: 348,
      text: 'signin_with', shape: 'rectangular',
    });
    document.getElementById('googleBtnWrapper').style.display = 'block';
  } catch {}
}

async function handleGoogleLogin(response) {
  try {
    const data = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    }).then(r => r.json());

    if (data.ok) {
      saveSession(data);
    } else {
      showError('loginError', data.error || 'Error con Google');
    }
  } catch { showError('loginError', 'Error de conexión'); }
}

initGoogle();

// ── HELPERS ──
function saveSession(data) {
  localStorage.setItem(TOKEN_KEY, data.token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(data.user));
  window.location.href = 'home.html';
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.style.display = 'block';
}

// ── TOGGLE ──
document.getElementById('showRegister').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('loginCard').style.display = 'none';
  document.getElementById('registerCard').style.display = 'block';
});
document.getElementById('showLogin').addEventListener('click', e => {
  e.preventDefault();
  document.getElementById('registerCard').style.display = 'none';
  document.getElementById('loginCard').style.display = 'block';
});

// ── LOGIN ──
document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  document.getElementById('loginError').style.display = 'none';
  try {
    const data = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(r => r.json());

    if (data.ok) { saveSession(data); }
    else showError('loginError', data.error || 'Credenciales incorrectas');
  } catch { showError('loginError', 'Error de conexión'); }
});

// ── REGISTER ──
document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  document.getElementById('registerError').style.display = 'none';
  try {
    const data = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    }).then(r => r.json());

    if (data.ok) {
      saveSession(data);
    } else {
      showError('registerError', data.error);
    }
  } catch { showError('registerError', 'Error de conexión'); }
});
