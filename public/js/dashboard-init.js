/**
 * dashboard-init.js — Dashboard page entry point
 *
 * Has timeout protection so "verifying credentials" never hangs forever.
 */

import { getCurrentUser, getUserRole, renderNavAuth, openAuthModal, onAuthStateChange } from './modules/auth.js';
import { initDashboard } from './modules/dashboard.js';
import { initNavToggle } from './modules/ui.js';

function withTimeout(promise, ms, fallback) {
  const timer = new Promise(resolve => setTimeout(() => resolve(fallback), ms));
  return Promise.race([promise, timer]);
}

async function init() {
  initNavToggle();

  const user = await withTimeout(getCurrentUser(), 8000, null);

  if (!user) {
    document.getElementById('authGate').innerHTML = `
      <div style="text-align:center;padding:40px;">
        <div style="font-size:3rem;margin-bottom:16px;">🔒</div>
        <h2 style="margin-bottom:8px;">Authentication Required</h2>
        <p style="color:var(--gray-400);margin-bottom:24px;">Please sign in to access the dashboard.</p>
        <button class="btn btn-primary" id="gateLoginBtn">Sign In</button>
        <br/><br/>
        <a href="/" class="btn btn-ghost btn-sm">← Back to Site</a>
      </div>
    `;
    document.getElementById('gateLoginBtn')?.addEventListener('click', () => openAuthModal());
    onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) window.location.reload();
    });
    renderNavAuth(null, 'public');
    return;
  }

  let role = 'author';
  try {
    role = await withTimeout(getUserRole(user.id), 5000, 'author');
  } catch {
    role = 'author';
  }

  renderNavAuth(user, role);

  if (!['author', 'editor', 'admin'].includes(role)) {
    document.getElementById('authGate').innerHTML = `
      <div style="text-align:center;padding:40px;">
        <div style="font-size:3rem;margin-bottom:16px;">🚫</div>
        <h2>Access Denied</h2>
        <p style="color:var(--gray-400);margin:16px 0;">Your account does not have author access.</p>
        <a href="/" class="btn btn-primary">← Back to Site</a>
      </div>
    `;
    return;
  }

  await initDashboard(user, role);

  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') window.location.href = '/';
  });
}

init().catch(err => {
  console.error('Dashboard init error:', err);
  document.getElementById('authGate').innerHTML = `
    <div style="text-align:center;padding:40px;">
      <div style="font-size:3rem;margin-bottom:16px;">⚠️</div>
      <h2>Something went wrong</h2>
      <p style="color:var(--gray-400);margin:16px 0;">${err.message}</p>
      <button class="btn btn-primary" onclick="location.reload()">Try Again</button>
    </div>
  `;
});
