const USERS_KEY = 'lupeflix_users';
const SESSION_KEY = 'lupeflix_session';

function getUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

if (localStorage.getItem(SESSION_KEY)) {
  window.location.href = 'home.html';
}

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegister = document.getElementById('showRegister');
const showLogin = document.getElementById('showLogin');
const loginCard = document.querySelector('.login-card:not(.register-card)');
const registerCard = document.getElementById('registerCard');

showRegister.addEventListener('click', (e) => {
  e.preventDefault();
  loginCard.style.display = 'none';
  registerCard.style.display = 'block';
});

showLogin.addEventListener('click', (e) => {
  e.preventDefault();
  registerCard.style.display = 'none';
  loginCard.style.display = 'block';
});

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('loginError');

  const users = getUsers();
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';
  localStorage.setItem(SESSION_KEY, JSON.stringify({ name: user.name, email: user.email }));
  window.location.href = 'home.html';
});

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errorEl = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');

  const users = getUsers();

  if (users.find(u => u.email === email)) {
    errorEl.textContent = 'Ese correo ya está registrado.';
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
    return;
  }

  users.push({ name, email, password });
  saveUsers(users);

  errorEl.style.display = 'none';
  successEl.style.display = 'block';
  registerForm.reset();

  setTimeout(() => {
    registerCard.style.display = 'none';
    loginCard.style.display = 'block';
    successEl.style.display = 'none';
  }, 2000);
});
