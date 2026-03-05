/**
 * dashboard.js — Author dashboard logic
 *
 * Handles panel navigation, article CRUD forms,
 * stats display, and profile management.
 */


import {
  fetchAuthorArticles, fetchAllArticles,
  fetchArticleStats, createArticle,
  updateArticle, deleteArticle,
  fetchProfile, upsertProfile,
  fetchAllProfiles, updateUserRole, deleteUserAccount,
} from './api.js';
import { initUploadZone } from './storage.js';
import {
  showToast, showConfirm, showEmpty, showLoading,
  formatDate, relativeTime, slugify, escHtml, debounce,
} from './ui.js';
import { getCategoryLabel } from '../config.js';
import { hasRole } from './auth.js';

let currentUser = null;
let currentRole = 'author';
let myArticles  = [];

// ── Dashboard init ───────────────────────────────────────────

/**
 * Bootstrap the dashboard for an authenticated user.
 * @param {User} user
 * @param {string} role
 */
export async function initDashboard(user, role) {
  currentUser = user;
  currentRole = role;

  // Show dashboard, hide auth gate
  document.getElementById('authGate').style.display       = 'none';
  document.getElementById('dashboardLayout').style.display = 'grid';

  // Set user display
  const profile = await fetchProfile(user.id);
  const displayName = profile.data?.display_name || user.email.split('@')[0];

  document.getElementById('dashUserName').textContent  = displayName;
  document.getElementById('dashUserLabel').textContent = displayName;

  // Show admin nav if elevated role
  if (hasRole(role, 'editor')) {
    document.getElementById('adminNavSection').style.display = '';
    document.getElementById('allArticlesNav').style.display  = '';
  }
  // PubMed import is admin-only
  if (hasRole(role, 'admin')) {
    document.getElementById('importNav').style.display = '';
    document.getElementById('usersNav').style.display  = '';
  }

  // Wire up panel navigation
  initPanelNav();

  // Wire up action buttons
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
  document.querySelectorAll('[data-panel-trigger]').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panelTrigger));
  });

  // Refresh overview when importer publishes new articles
  window.addEventListener('articles-updated', () => loadOverview());

  // Load initial data
  await loadOverview();
  initArticleForm();
  initProfilePanel(user, profile.data, role);
  if (hasRole(role, 'admin')) {
    initImportPanel();
    initUsersPanel();
  }
  initDeleteAccount(user);
}

// ── Panel navigation ─────────────────────────────────────────

function initPanelNav() {
  document.querySelectorAll('[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });
}

export function switchPanel(panelId) {
  // Update nav items
  document.querySelectorAll('.dash-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.panel === panelId);
  });

  // Show/hide panels
  document.querySelectorAll('.dash-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${panelId}`);
  });

  // Lazy-load panel data
  if (panelId === 'articles')      loadMyArticles();
  if (panelId === 'all-articles')  loadAllArticles();
  if (panelId === 'new-article')   resetArticleForm();
  // import panel is initialised once in initDashboard
}

// ── Overview ─────────────────────────────────────────────────

async function loadOverview() {
  const scope = hasRole(currentRole, 'editor') ? null : currentUser.id;
  const stats = await fetchArticleStats(scope);

  document.getElementById('statTotal').textContent     = stats.total;
  document.getElementById('statPublished').textContent = stats.published;
  document.getElementById('statDrafts').textContent    = stats.drafts;

  // Recent articles table
  const { data, error } = hasRole(currentRole, 'editor')
    ? await fetchAllArticles()
    : await fetchAuthorArticles(currentUser.id);

  const container = document.getElementById('recentArticlesWrap');
  if (error || !data?.length) {
    showEmpty(container, 'No articles yet', 'Create your first article to get started.', '📝',
      '<button class="btn btn-primary btn-sm" onclick="window.dashSwitchPanel(\'new-article\')">✏️ Create Article</button>');
    return;
  }

  renderArticlesTable(container, data.slice(0, 8));
}

// ── My Articles ──────────────────────────────────────────────

let currentFilter = 'all';

async function loadMyArticles() {
  const container = document.getElementById('myArticlesWrap');
  showLoading(container, 'Loading your articles…');

  const { data, error } = await fetchAuthorArticles(currentUser.id);

  if (error) {
    container.innerHTML = `<div class="alert alert-error m-4">Error: ${escHtml(error.message)}</div>`;
    return;
  }

  myArticles = data || [];
  renderFilteredArticles();

  // Wire filter buttons
  document.querySelectorAll('#panel-articles [data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('#panel-articles [data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderFilteredArticles();
    });
  });
}

function renderFilteredArticles() {
  const container = document.getElementById('myArticlesWrap');
  const filtered  = currentFilter === 'all'
    ? myArticles
    : myArticles.filter(a => a.status === currentFilter);

  if (!filtered.length) {
    showEmpty(container, `No ${currentFilter === 'all' ? '' : currentFilter} articles`,
      'Nothing here yet.', '📝');
    return;
  }

  renderArticlesTable(container, filtered, true);
}

// ── All Articles (Admin/Editor) ──────────────────────────────

async function loadAllArticles() {
  if (!hasRole(currentRole, 'editor')) return;
  const container = document.getElementById('allArticlesWrap');
  showLoading(container);

  const { data, error } = await fetchAllArticles();
  if (error || !data?.length) {
    showEmpty(container, 'No articles found', '', '📰');
    return;
  }

  renderArticlesTable(container, data, true);
}

// ── Article Table renderer ───────────────────────────────────

function renderArticlesTable(container, articles, showActions = false) {
  const el = typeof container === 'string' ? document.getElementById(container) : container;
  if (!el) return;

  el.innerHTML = `
    <table class="articles-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Category</th>
          <th>Status</th>
          <th>Date</th>
          ${showActions ? '<th>Actions</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${articles.map(a => articleRowHtml(a, showActions)).join('')}
      </tbody>
    </table>`;

  // Wire action buttons
  if (showActions) {
    el.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => startEditArticle(btn.dataset.edit));
    });
    el.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', () => confirmDeleteArticle(btn.dataset.delete, btn.dataset.title));
    });
    el.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.open(`/article.html?slug=${encodeURIComponent(btn.dataset.view)}`, '_blank');
      });
    });
  }
}

function articleRowHtml(article, showActions) {
  const cat    = getCategoryLabel(article.category);
  const author = article.profiles?.display_name || '';
  const date   = article.published_at || article.updated_at || article.created_at;

  const statusBadge = {
    published: '<span class="badge badge-published">Published</span>',
    draft:     '<span class="badge badge-draft">Draft</span>',
  }[article.status] || `<span class="badge badge-draft">${escHtml(article.status)}</span>`;

  return `
    <tr>
      <td>
        <div class="table-title-cell">
          <strong>${escHtml(article.title)}</strong>
          ${author ? `<small>by ${escHtml(author)}</small>` : ''}
        </div>
      </td>
      <td><span style="font-size:0.875rem;">${escHtml(cat.emoji)} ${escHtml(cat.label)}</span></td>
      <td>${statusBadge}</td>
      <td style="white-space:nowrap;font-size:0.8rem;color:var(--gray-400);">${formatDate(date, 'short')}</td>
      ${showActions ? `
      <td>
        <div class="table-actions">
          ${article.status === 'published' ? `
            <button class="btn btn-ghost btn-sm" data-view="${escHtml(article.slug)}" title="View article">👁</button>
          ` : ''}
          <button class="btn btn-secondary btn-sm" data-edit="${escHtml(article.id)}" title="Edit">✏️</button>
          <button class="btn btn-danger btn-sm" data-delete="${escHtml(article.id)}" data-title="${escHtml(article.title)}" title="Delete">🗑</button>
        </div>
      </td>` : ''}
    </tr>`;
}

// ── Article Form ─────────────────────────────────────────────

let editingArticleId = null;

function initArticleForm() {
  const form       = document.getElementById('articleForm');
  const titleInput = document.getElementById('artTitle');
  const slugInput  = document.getElementById('artSlug');
  const summaryTa  = document.getElementById('artSummary');

  if (!form) return;

  // Auto-generate slug from title
  titleInput?.addEventListener('input', debounce(() => {
    if (!editingArticleId || !slugInput.value) {
      slugInput.value = slugify(titleInput.value);
    }
  }, 400));

  // Character counter for summary
  summaryTa?.addEventListener('input', () => {
    const count = document.getElementById('summaryCount');
    if (count) count.textContent = summaryTa.value.length;
  });

  // Init upload zone
  initUploadZone({
    zoneId:       'uploadZone',
    inputId:      'heroImageInput',
    previewWrapId: 'uploadPreviewWrap',
    previewImgId:  'uploadPreviewImg',
    removeId:     'removeHeroImg',
    hiddenInputId: 'artHeroImage',
    onUpload: (url) => {
      if (url) showToast('Image uploaded!', 'success');
    },
    onError: (msg) => showToast(msg, 'error'),
    onLoading: (loading) => {
      const btn = document.getElementById('publishBtn');
      if (btn) btn.disabled = loading;
    },
  });

  // Draft button
  document.getElementById('saveDraftBtn')?.addEventListener('click', () => {
    document.getElementById('artStatus').value = 'draft';
    form.requestSubmit();
  });

  // Publish sets status then submits
  document.getElementById('publishBtn')?.addEventListener('click', () => {
    document.getElementById('artStatus').value = 'published';
    form.requestSubmit();
  });

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleArticleSubmit();
  });

  // Cancel edit
  document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    resetArticleForm();
    switchPanel('articles');
  });
}

function resetArticleForm() {
  editingArticleId = null;
  document.getElementById('editArticleId').value = '';
  document.getElementById('articleForm')?.reset();
  document.getElementById('summaryCount').textContent = '0';
  document.getElementById('artHeroImage').value = '';
  document.getElementById('uploadPreviewWrap').style.display = 'none';
  document.getElementById('uploadZoneWrap').style.display = '';
  document.getElementById('articleFormTitle').textContent    = 'New Article';
  document.getElementById('articleFormSubtitle').textContent = 'Create a new article for publication.';
  document.getElementById('cancelEditBtn').style.display     = 'none';
  document.getElementById('articleFormAlerts').innerHTML     = '';
}

async function startEditArticle(id) {
  // Find article in loaded data
  const { fetchAuthorArticles, fetchAllArticles } = await import('./api.js');
  const { data } = hasRole(currentRole, 'editor')
    ? await fetchAllArticles()
    : await fetchAuthorArticles(currentUser.id);

  const article = (data || []).find(a => a.id === id);
  if (!article) {
    showToast('Article not found.', 'error');
    return;
  }

  switchPanel('new-article');

  // Populate form
  editingArticleId = id;
  document.getElementById('editArticleId').value = id;
  document.getElementById('artTitle').value    = article.title    || '';
  document.getElementById('artSlug').value     = article.slug     || '';
  document.getElementById('artCategory').value = article.category || '';
  document.getElementById('artStatus').value   = article.status   || 'draft';
  document.getElementById('artSummary').value  = article.summary  || '';
  document.getElementById('artBody').value     = article.body     || '';
  document.getElementById('artTags').value     = (article.tags || []).join(', ');
  document.getElementById('summaryCount').textContent = (article.summary || '').length;

  if (article.hero_image) {
    document.getElementById('artHeroImage').value = article.hero_image;
    document.getElementById('uploadPreviewImg').src = article.hero_image;
    document.getElementById('uploadPreviewWrap').style.display = '';
    document.getElementById('uploadZoneWrap').style.display = 'none';
  }

  document.getElementById('articleFormTitle').textContent    = 'Edit Article';
  document.getElementById('articleFormSubtitle').textContent = `Editing: "${article.title}"`;
  document.getElementById('cancelEditBtn').style.display     = '';
}

async function handleArticleSubmit() {
  const alertsEl = document.getElementById('articleFormAlerts');
  alertsEl.innerHTML = '';

  const title    = document.getElementById('artTitle').value.trim();
  const slug     = document.getElementById('artSlug').value.trim();
  const category = document.getElementById('artCategory').value;
  const status   = document.getElementById('artStatus').value;
  const summary  = document.getElementById('artSummary').value.trim();
  const body     = document.getElementById('artBody').value.trim();
  const tagsRaw  = document.getElementById('artTags').value;
  const heroImg  = document.getElementById('artHeroImage').value;

  // Validation
  const errors = [];
  if (!title)    errors.push('Title is required.');
  if (!slug)     errors.push('Slug is required.');
  if (!category) errors.push('Category is required.');
  if (!summary)  errors.push('Summary is required.');
  if (!body)     errors.push('Article body is required.');

  if (errors.length) {
    alertsEl.innerHTML = `<div class="alert alert-error">
      ${errors.map(e => `<div>• ${escHtml(e)}</div>`).join('')}
    </div>`;
    return;
  }

  const tags = tagsRaw
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean);

  const payload = {
    title, slug, category, status, summary, body, tags,
    hero_image:   heroImg || null,
    author_id:    currentUser.id,
    published_at: status === 'published' ? new Date().toISOString() : null,
  };

  // UI feedback
  const publishBtn = document.getElementById('publishBtn');
  const formStatus = document.getElementById('formStatus');
  publishBtn.disabled = true;
  formStatus.textContent = 'Saving…';

  let result;
  if (editingArticleId) {
    result = await updateArticle(editingArticleId, payload);
  } else {
    result = await createArticle(payload);
  }

  publishBtn.disabled = false;
  formStatus.textContent = '';

  if (result.error) {
    alertsEl.innerHTML = `<div class="alert alert-error">
      Error: ${escHtml(result.error.message)}
    </div>`;
    return;
  }

  showToast(
    editingArticleId ? 'Article updated!' : 'Article created!',
    'success'
  );

  resetArticleForm();
  switchPanel('articles');
  await loadOverview();
}

async function confirmDeleteArticle(id, title) {
  const confirmed = await showConfirm(
    'Delete Article',
    `Are you sure you want to delete "${title}"? This action cannot be undone.`
  );

  if (!confirmed) return;

  const { error } = await deleteArticle(id);

  if (error) {
    showToast('Failed to delete article: ' + error.message, 'error');
    return;
  }

  showToast('Article deleted.', 'success');
  myArticles = myArticles.filter(a => a.id !== id);
  renderFilteredArticles();
  await loadOverview();
}

// ── Profile Panel ────────────────────────────────────────────

function initProfilePanel(user, profile, role) {
  const initials = (profile?.display_name || user.email).slice(0, 2).toUpperCase();
  document.getElementById('profileAvatarLg').textContent  = initials;
  document.getElementById('profileNameDisplay').textContent = profile?.display_name || user.email.split('@')[0];
  document.getElementById('profileEmailDisplay').textContent = user.email;
  document.getElementById('profileDisplayName').value = profile?.display_name || '';

  const roleLabels = { admin: '🔴 Admin', editor: '🟡 Editor', author: '🟢 Author' };
  const roleBadge = document.getElementById('profileRoleBadge');
  if (roleBadge) {
    roleBadge.innerHTML = `<span class="badge badge-teal">${roleLabels[role] || role}</span>`;
  }

  document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const displayName = document.getElementById('profileDisplayName').value.trim();
    const alerts = document.getElementById('profileAlerts');

    const { error } = await upsertProfile({ id: user.id, display_name: displayName });
    if (error) {
      alerts.innerHTML = `<div class="alert alert-error">${escHtml(error.message)}</div>`;
      return;
    }

    alerts.innerHTML = '';
    document.getElementById('profileNameDisplay').textContent = displayName;
    document.getElementById('dashUserName').textContent = displayName;
    document.getElementById('dashUserLabel').textContent = displayName;
    showToast('Profile updated!', 'success');
  });
}

// ── Logout ───────────────────────────────────────────────────

async function handleLogout() {
  const { logout } = await import('./auth.js');
  await logout();
  window.location.href = '/';
}

// ── Expose panel switch globally (for HTML onclick) ──────────
window.dashSwitchPanel = switchPanel;

// ── PubMed Import Panel ──────────────────────────────────────

let pubmedPreviews = []; // current search result summaries
let selectedPMIDs  = new Set();

function initImportPanel() {
  // Search button
  document.getElementById('pubmedSearchBtn')
    ?.addEventListener('click', handlePubMedSearch);

  // Enter key in search box
  document.getElementById('pubmedSearchInput')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') handlePubMedSearch(); });

  // Quick preset buttons
  document.getElementById('pubmedPresets')
    ?.addEventListener('click', e => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      document.getElementById('pubmedSearchInput').value = btn.dataset.preset;
      handlePubMedSearch();
    });

  // Select all / none
  document.getElementById('selectAllBtn')
    ?.addEventListener('click', () => {
      selectedPMIDs = new Set(pubmedPreviews.map(p => p.pmid));
      renderPubMedCheckboxes();
      updateSelectedCount();
    });

  document.getElementById('selectNoneBtn')
    ?.addEventListener('click', () => {
      selectedPMIDs.clear();
      renderPubMedCheckboxes();
      updateSelectedCount();
    });

  // Import selected
  document.getElementById('importSelectedBtn')
    ?.addEventListener('click', handleImportSelected);

  // Auto-import run now
  document.getElementById('autoImportBtn')
    ?.addEventListener('click', handleAutoImport);
}

async function handlePubMedSearch() {
  const input      = document.getElementById('pubmedSearchInput');
  const maxResults = parseInt(document.getElementById('pubmedMaxResults').value);
  const query      = input?.value?.trim();

  if (!query) {
    showToast('Enter a search term first.', 'warning');
    return;
  }

  const btn = document.getElementById('pubmedSearchBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Searching…';

  const resultsWrap = document.getElementById('pubmedResults');
  const listEl      = document.getElementById('pubmedResultsList');
  listEl.innerHTML  = '';
  resultsWrap.style.display = 'none';
  document.getElementById('importResult').style.display = 'none';
  const emptyPrompt = document.getElementById('pubmedEmptyPrompt');
  if (emptyPrompt) emptyPrompt.style.display = 'none';

  const { previewPubMedSearch } = await import('./pubmed.js');
  const { previews, error } = await previewPubMedSearch(query, maxResults);

  btn.disabled = false;
  btn.textContent = 'Search PubMed';

  if (error) {
    showToast('PubMed search failed: ' + error, 'error');
    return;
  }

  pubmedPreviews = previews;
  selectedPMIDs  = new Set(previews.map(p => p.pmid)); // all selected by default

  if (!previews.length) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-state-icon">🔍</div>
        <h3>No results</h3>
        <p>Try a broader search term or different date range.</p>
      </div>`;
    resultsWrap.style.display = '';
    document.getElementById('pubmedResultCount').textContent = 'No results found.';
    return;
  }

  document.getElementById('pubmedResultCount').textContent =
    `Found ${previews.length} article${previews.length !== 1 ? 's' : ''}`;

  renderPubMedCheckboxes();
  updateSelectedCount();
  resultsWrap.style.display = '';
}

function renderPubMedCheckboxes() {
  const listEl = document.getElementById('pubmedResultsList');
  if (!listEl) return;

  listEl.innerHTML = pubmedPreviews.map(p => {
    const isChecked = selectedPMIDs.has(p.pmid);
    const cat       = getCategoryLabel(p.category);
    const date      = p.pubdate ? p.pubdate.split(' ').slice(0,3).join(' ') : '';

    return `
      <label style="
        display:flex; align-items:flex-start; gap:14px;
        padding:16px; margin-bottom:10px;
        background:${isChecked ? 'var(--teal-glow)' : 'var(--off-white)'};
        border:1.5px solid ${isChecked ? 'rgba(0,180,216,0.3)' : 'var(--gray-200)'};
        border-radius:var(--radius-md); cursor:pointer;
        transition: all var(--transition);">
        <input type="checkbox" data-pmid="${p.pmid}"
          ${isChecked ? 'checked' : ''}
          style="margin-top:3px;width:16px;height:16px;accent-color:var(--teal);flex-shrink:0;" />
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:0.9rem;color:var(--navy);margin-bottom:4px;line-height:1.35;">
            ${escHtml(p.title)}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;">
            <span class="badge badge-teal" style="font-size:0.7rem;">${cat.emoji} ${escHtml(cat.label)}</span>
            ${p.journal ? `<span style="font-size:0.8rem;color:var(--gray-600);">${escHtml(p.journal)}</span>` : ''}
            ${date ? `<span style="font-size:0.75rem;color:var(--gray-400);">${escHtml(date)}</span>` : ''}
            <a href="https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/" target="_blank"
              style="font-size:0.75rem;color:var(--teal-dark);" onclick="event.stopPropagation()">
              PMID ${p.pmid} ↗
            </a>
          </div>
          ${p.authors ? `<div style="font-size:0.8rem;color:var(--gray-400);margin-top:4px;">${escHtml(p.authors)}${pubmedPreviews.find(x=>x.pmid===p.pmid)?._summary?.authors?.length > 2 ? ' et al.' : ''}</div>` : ''}
        </div>
      </label>`;
  }).join('');

  // Wire checkbox changes
  listEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        selectedPMIDs.add(cb.dataset.pmid);
      } else {
        selectedPMIDs.delete(cb.dataset.pmid);
      }
      // Re-render to update colours
      renderPubMedCheckboxes();
      updateSelectedCount();
    });
  });
}

function updateSelectedCount() {
  const countEl = document.getElementById('selectedCount');
  const btn     = document.getElementById('importSelectedBtn');
  const n       = selectedPMIDs.size;
  if (countEl) countEl.textContent = n;
  if (btn)     btn.disabled        = n === 0;
}

async function handleImportSelected() {
  const toImport = pubmedPreviews
    .filter(p => selectedPMIDs.has(p.pmid))
    .map(p => p._summary);

  if (!toImport.length) return;

  // Show progress
  const progressWrap = document.getElementById('importProgress');
  const progressBar  = document.getElementById('importProgressBar');
  const progressMsg  = document.getElementById('importProgressMsg');
  const resultEl     = document.getElementById('importResult');
  const importBtn    = document.getElementById('importSelectedBtn');

  progressWrap.style.display = '';
  resultEl.style.display     = 'none';
  importBtn.disabled         = true;

  const { importPubMedArticles } = await import('./pubmed.js');

  const { imported, skipped, errors } = await importPubMedArticles(
    toImport,
    currentUser.id,
    (done, total) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      progressBar.style.width = `${pct}%`;
      progressMsg.textContent = `Importing… ${done}/${total}`;
    }
  );

  progressWrap.style.display = 'none';
  importBtn.disabled         = false;

  // Show result summary
  const hasErrors = errors.length > 0;
  resultEl.innerHTML = `
    <div class="alert ${hasErrors ? 'alert-info' : 'alert-success'}">
      <div>
        ✅ <strong>${imported}</strong> article${imported !== 1 ? 's' : ''} imported
        ${skipped ? ` · <strong>${skipped}</strong> already existed (skipped)` : ''}
        ${hasErrors ? ` · <strong>${errors.length}</strong> error${errors.length !== 1 ? 's' : ''}` : ''}
      </div>
      ${hasErrors ? `<details style="margin-top:8px;font-size:0.8rem;">
        <summary>Show errors</summary>
        <ul style="margin-top:6px;padding-left:16px;">${errors.map(e => `<li>${escHtml(e)}</li>`).join('')}</ul>
      </details>` : ''}
    </div>`;
  resultEl.style.display = '';

  if (imported > 0) {
    showToast(`${imported} PubMed article${imported !== 1 ? 's' : ''} published!`, 'success');
    await loadOverview();
  }
}

async function handleAutoImport() {
  const btn       = document.getElementById('autoImportBtn');
  const statusEl  = document.getElementById('autoImportStatus');
  const msgEl     = document.getElementById('autoImportMsg');

  btn.disabled    = true;
  btn.innerHTML   = '<span class="spinner"></span> Running…';
  statusEl.style.display = '';
  msgEl.textContent = '⚡ Auto-import running — fetching all configured search terms…';

  const { runAutoImport } = await import('./pubmed.js');

  const { imported, skipped, errors } = await runAutoImport(
    currentUser.id,
    (done, total) => {
      if (total > 0) msgEl.textContent = `⚡ Importing… ${done}/${total}`;
    }
  );

  btn.disabled  = false;
  btn.innerHTML = '⚡ Run Auto-Import';

  statusEl.className = errors.length > 0 ? 'alert alert-info' : 'alert alert-success';
  msgEl.innerHTML = `
    Done! ✅ <strong>${imported}</strong> imported · <strong>${skipped}</strong> skipped
    ${errors.length ? ` · ${errors.length} error(s)` : ''}
  `;

  if (imported > 0) {
    showToast(`Auto-import: ${imported} new article${imported !== 1 ? 's' : ''} published.`, 'success');
    await loadOverview();
  }
}

// ── Users Panel (admin) ──────────────────────────────────────

async function initUsersPanel() {
  // Load when panel opens
  document.querySelector('[data-panel="users"]')?.addEventListener('click', () => {
    loadUsers('');
  });

  // Search
  let debounceTimer;
  document.getElementById('userSearchInput')?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => loadUsers(e.target.value.trim()), 300);
  });
}

async function loadUsers(search = '') {
  const wrap = document.getElementById('usersTableWrap');
  if (!wrap) return;
  wrap.innerHTML = '<div class="loading-center" style="padding:40px;"><div class="spinner"></div></div>';

  const { data: users, error } = await fetchAllProfiles(search);
  if (error || !users.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>${search ? 'No users matched' : 'No users yet'}</h3></div>`;
    return;
  }

  const roleOptions = ['reader', 'author', 'editor', 'admin'];
  wrap.innerHTML = `
    <table class="articles-table">
      <thead><tr>
        <th>Name</th><th>Role</th><th>Joined</th><th style="text-align:right;">Actions</th>
      </tr></thead>
      <tbody>
        ${users.map(u => `
          <tr data-uid="${escHtml(u.id)}">
            <td><strong>${escHtml(u.display_name || '—')}</strong></td>
            <td>
              <select class="form-input" style="padding:4px 8px;font-size:0.8rem;width:auto;" data-role-select="${escHtml(u.id)}">
                ${roleOptions.map(r => `<option value="${r}" ${u.role===r?'selected':''}>${r}</option>`).join('')}
              </select>
            </td>
            <td style="font-size:0.8rem;color:var(--gray-400);">${formatDate(u.created_at, 'short')}</td>
            <td style="text-align:right;">
              <div style="display:flex;gap:6px;justify-content:flex-end;">
                <button class="btn btn-secondary btn-sm" data-save-role="${escHtml(u.id)}">Save</button>
                <button class="btn btn-danger btn-sm" data-delete-user="${escHtml(u.id)}" data-user-name="${escHtml(u.display_name || 'this user')}">Delete</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  wrap.querySelectorAll('[data-save-role]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid  = btn.dataset.saveRole;
      const sel  = wrap.querySelector(`[data-role-select="${uid}"]`);
      const role = sel?.value;
      if (!role) return;
      btn.disabled = true; btn.textContent = '…';
      const { error } = await updateUserRole(uid, role);
      btn.disabled = false; btn.textContent = 'Save';
      if (error) showToast('Failed to update role', 'error');
      else showToast('Role updated!', 'success');
    });
  });

  wrap.querySelectorAll('[data-delete-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid      = btn.dataset.deleteUser;
      const userName = btn.dataset.userName;
      const confirmed = await showConfirm(
        `Delete ${userName}?`,
        `This will permanently delete their profile, comments, and likes. This cannot be undone.`
      );
      if (!confirmed) return;
      btn.disabled = true; btn.textContent = '…';
      const { error } = await deleteUserAccount(uid);
      if (error) {
        btn.disabled = false; btn.textContent = 'Delete';
        showToast('Failed to delete account: ' + error.message, 'error');
        return;
      }
      showToast(`${userName} deleted.`, 'success');
      // Remove row
      btn.closest('tr')?.remove();
    });
  });
}

// ── Delete Account ───────────────────────────────────────────

function initDeleteAccount(user) {
  const showBtn   = document.getElementById('showDeleteAccountBtn');
  const cancelBtn = document.getElementById('cancelDeleteAccountBtn');
  const confirmBtn= document.getElementById('confirmDeleteAccountBtn');
  const form      = document.getElementById('deleteAccountForm');

  showBtn?.addEventListener('click', () => {
    form.style.display = '';
    showBtn.style.display = 'none';
  });
  cancelBtn?.addEventListener('click', () => {
    form.style.display = 'none';
    showBtn.style.display = '';
    document.getElementById('deletePassword').value = '';
  });
  confirmBtn?.addEventListener('click', async () => {
    const password = document.getElementById('deletePassword')?.value;
    const alerts   = document.getElementById('deleteAccountAlerts');
    if (!password) {
      alerts.innerHTML = '<div class="alert alert-error">Please enter your password.</div>';
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting…';

    // Re-authenticate to verify password
    const { supabase } = await import('./api.js');
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (signInErr) {
      alerts.innerHTML = '<div class="alert alert-error">Incorrect password. Account not deleted.</div>';
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete My Account';
      return;
    }

    // Delete profile (triggers cascade)
    const { error: delErr } = await deleteUserAccount(user.id);
    if (delErr) {
      alerts.innerHTML = `<div class="alert alert-error">${escHtml(delErr.message)}</div>`;
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete My Account';
      return;
    }

    // Sign out and redirect
    await supabase.auth.signOut();
    window.location.href = '/?deleted=1';
  });
}
