/**
 * main.js — Homepage entry point
 *
 * Bootstraps auth state, nav, and the public article listing.
 */

import { getCurrentUser, getUserRole, renderNavAuth, onAuthStateChange } from './modules/auth.js';
import { initArticlesPage } from './modules/articles.js';
import { initScrollAnimations, initNavToggle } from './modules/ui.js';

async function init() {
  // Init UI utilities
  initNavToggle();
  initScrollAnimations();

  // Check auth state and render nav
  const user = await getCurrentUser();
  const role = user ? await getUserRole(user.id) : 'public';
  renderNavAuth(user, role);

  // Footer login link
  document.getElementById('footerLoginLink')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const { openAuthModal } = await import('./modules/auth.js');
    openAuthModal();
  });

  // Load articles
  await initArticlesPage();

  // Re-render nav on auth changes
  onAuthStateChange(async (event, session) => {
    const newUser = session?.user || null;
    const newRole = newUser ? await getUserRole(newUser.id) : 'public';
    renderNavAuth(newUser, newRole);
  });
}

init().catch(console.error);
