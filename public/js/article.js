/**
 * article.js — Single article page entry point
 */

import { getCurrentUser, getUserRole, renderNavAuth, onAuthStateChange } from './modules/auth.js';
import { initArticlePage } from './modules/articles.js';
import { initScrollAnimations, initNavToggle } from './modules/ui.js';

async function init() {
  initNavToggle();
  initScrollAnimations();

  const user = await getCurrentUser();
  const role = user ? await getUserRole(user.id) : 'public';
  renderNavAuth(user, role);

  await initArticlePage();

  onAuthStateChange(async (event, session) => {
    const newUser = session?.user || null;
    const newRole = newUser ? await getUserRole(newUser.id) : 'public';
    renderNavAuth(newUser, newRole);
  });
}

init().catch(console.error);
