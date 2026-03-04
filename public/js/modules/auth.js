/**
 * auth.js — Authentication helpers using Supabase Auth
 *
 * Manages login, logout, session persistence, and role resolution.
 * Renders the auth UI elements in the nav and modal.
 */

import { supabase } from './api.js';
import { fetchProfile, upsertProfile } from './api.js';
import { showToast } from './ui.js';

// ── Session helpers ──────────────────────────────────────────

/**
 * Get the currently authenticated user, or null.
 * @returns {Promise<User|null>}
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}

/**
 * Get the role for a given user from the profiles table.
 * @param {string} userId
 * @returns {Promise<'admin'|'editor'|'author'|'public'>}
 */
export async function getUserRole(userId) {
  if (!userId) return 'public';
  const { data } = await fetchProfile(userId);
  return data?.role || 'author';
}

/**
 * Login with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: User|null, error: Error|null}>}
 */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { user: data?.user || null, error };
}

/**
 * Sign out the current user.
 * @returns {Promise<void>}
 */
export async function logout() {
  await supabase.auth.signOut();
}

/**
 * Subscribe to auth state changes.
 * @param {function} callback - receives (event, session)
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange(callback);
}

// ── Profile auto-creation ────────────────────────────────────

/**
 * Ensure a profile row exists for the user (created on first login).
 * @param {User} user
 */
export async function ensureProfile(user) {
  const { data } = await fetchProfile(user.id);
  if (!data) {
    await upsertProfile({
      id: user.id,
      display_name: user.email.split('@')[0],
      role: 'author',
    });
  }
}

// ── Nav Auth UI ──────────────────────────────────────────────

/**
 * Render the auth buttons/user info in #navAuth.
 * @param {User|null} user
 * @param {string} role
 */
export function renderNavAuth(user, role = 'public') {
  const container = document.getElementById('navAuth');
  if (!container) return;

  if (!user) {
    container.innerHTML = `
      <button class="btn btn-primary btn-sm" id="openLoginBtn">
        Sign In
      </button>`;
    document.getElementById('openLoginBtn')?.addEventListener('click', openAuthModal);
  } else {
    const initials = getInitials(user.email);
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <a href="/dashboard.html" class="btn btn-secondary btn-sm">Dashboard</a>
        <div class="author-avatar" title="${escHtml(user.email)}" style="width:32px;height:32px;font-size:0.7rem;cursor:pointer;">
          ${escHtml(initials)}
        </div>
      </div>`;
  }
}

// ── Auth Modal ───────────────────────────────────────────────

let authModalOpen = false;

export function openAuthModal() {
  const overlay = document.getElementById('authModalOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  authModalOpen = true;
  renderLoginForm();

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeAuthModal();
  }, { once: true });
}

export function closeAuthModal() {
  const overlay = document.getElementById('authModalOverlay');
  overlay?.classList.remove('open');
  authModalOpen = false;
}

function renderLoginForm() {
  const body = document.getElementById('authModalBody');
  if (!body) return;

  body.innerHTML = `
    <div id="modalError" style="display:none;" class="alert alert-error" role="alert"></div>
    <div class="modal-form">
      <div class="form-group">
        <label class="form-label" for="loginEmail">Email Address</label>
        <input class="form-input" type="email" id="loginEmail"
          placeholder="you@hospital.org" autocomplete="email" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="loginPassword">Password</label>
        <input class="form-input" type="password" id="loginPassword"
          placeholder="••••••••" autocomplete="current-password" required />
      </div>
      <button class="btn btn-primary" id="loginSubmitBtn" style="width:100%;">
        Sign In
      </button>
      <div class="modal-divider">or</div>
      <button class="btn btn-ghost" id="closeModalBtn" style="width:100%;">
        Cancel
      </button>
    </div>
  `;

  document.getElementById('closeModalBtn')?.addEventListener('click', closeAuthModal);
  document.getElementById('loginSubmitBtn')?.addEventListener('click', handleLoginSubmit);

  // Enter key submits
  body.querySelectorAll('input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLoginSubmit();
    });
  });
}

async function handleLoginSubmit() {
  const email    = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  const errEl    = document.getElementById('modalError');
  const btn      = document.getElementById('loginSubmitBtn');

  if (!email || !password) {
    showModalError('Please enter your email and password.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in…';

  const { user, error } = await login(email, password);

  if (error) {
    showModalError(error.message || 'Login failed. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Sign In';
    return;
  }

  if (user) {
    await ensureProfile(user);
    closeAuthModal();
    showToast('Signed in successfully!', 'success');

    // Redirect to dashboard if on homepage
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
      window.location.href = '/dashboard.html';
    } else {
      window.location.reload();
    }
  }
}

function showModalError(msg) {
  const errEl = document.getElementById('modalError');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.style.display = 'flex';
}

// ── Utilities ────────────────────────────────────────────────

function getInitials(email = '') {
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

function escHtml(str = '') {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Guard a page for authenticated users only.
 * If not logged in, shows the auth modal then redirects.
 * Returns the user + role if authenticated.
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    openAuthModal();
    return { user: null, role: 'public' };
  }
  const role = await getUserRole(user.id);
  return { user, role };
}

/**
 * Check if a role has at least the minimum required privilege.
 */
export function hasRole(userRole, minRole) {
  const hierarchy = { admin: 4, editor: 3, author: 2, public: 1 };
  return (hierarchy[userRole] || 1) >= (hierarchy[minRole] || 1);
}
