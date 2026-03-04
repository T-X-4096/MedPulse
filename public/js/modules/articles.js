/**
 * articles.js — Article rendering and filtering logic
 *
 * Homepage always shows content:
 *  1. First tries Supabase DB (fast, cached)
 *  2. If DB empty, fetches live from PubMed API (no auth needed)
 * Categories are always populated from static config — never DB-dependent.
 */

import {
  fetchPublishedArticles,
  fetchArticleBySlug,
  fetchCategories,
  fetchLikes,
  fetchUserLike,
  toggleLike,
  fetchComments,
  addComment,
  deleteComment,
} from './api.js';
import {
  formatDate,
  readTime,
  escHtml,
  sanitizeHtml,
  showEmpty,
  populateCategoriesDropdown,
  showToast,
} from './ui.js';
import { getCategoryLabel, CATEGORIES, PAGE_SIZE } from '../config.js';
import { getCurrentUser, openAuthModal } from './auth.js';

let currentPage     = 1;
let currentCategory = null;
let currentTag      = null;

export async function initArticlesPage() {
  const params = new URLSearchParams(window.location.search);
  currentCategory = params.get('category') || null;
  currentTag      = params.get('tag')      || null;
  currentPage     = parseInt(params.get('page') || '1', 10);

  // Categories always come from static config — never wait for DB
  populateCategoriesDropdown(CATEGORIES.map(c => c.value));
  populateFiltersBar(CATEGORIES.map(c => c.value));

  if (currentCategory) {
    const cat    = getCategoryLabel(currentCategory);
    const header = document.getElementById('categoryHeader');
    if (header) {
      header.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="badge badge-teal">${cat.emoji} ${escHtml(cat.label)}</span>
          <a href="/" class="btn btn-ghost btn-sm">✕ Clear</a>
        </div>`;
    }
  }

  await loadArticles();
}

async function loadArticles() {
  const grid = document.getElementById('articlesGrid');
  if (!grid) return;

  showSkeletons(grid);

  // Try DB first
  const { data, count, error } = await fetchPublishedArticles({
    category: currentCategory,
    tag:      currentTag,
    page:     currentPage,
    pageSize: PAGE_SIZE,
  });

  if (error) {
    grid.innerHTML = `<div class="alert alert-error" style="grid-column:1/-1;">
      Failed to load articles: ${escHtml(error.message)}
    </div>`;
    return;
  }

  // DB has articles — render normally
  if (data.length) {
    renderPage(data, count);
    return;
  }

  // DB empty — fetch live from PubMed and display directly (no auth, no save)
  if (!currentCategory && !currentTag) {
    await loadFromPubMedDirect(grid);
  } else {
    showEmpty('articlesGrid', 'No articles found',
      `No published articles in "${getCategoryLabel(currentCategory || '').label}" yet.`, '📰');
  }
}

// ── Live PubMed fetch — no auth, no DB writes ────────────────

const LIVE_SEARCHES = [
  { q: 'clinical trial[pt] AND humans[mh] AND ("last 30 days"[dp]) AND hasabstract',  cat: 'research'           },
  { q: 'cardiology[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract',            cat: 'cardiology'         },
  { q: 'neoplasms[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract',             cat: 'oncology'           },
  { q: 'neurology[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract',             cat: 'neurology'          },
  { q: 'communicable diseases[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract', cat: 'infectious-disease' },
  { q: 'mental health[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract',         cat: 'mental-health'      },
  { q: 'public health[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract',         cat: 'public-health'      },
  { q: 'artificial intelligence AND medicine AND ("last 30 days"[PDat])',               cat: 'technology'         },
];

async function loadFromPubMedDirect(grid) {
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
      <div style="font-size:2.5rem;margin-bottom:14px;">🔬</div>
      <h3 style="margin-bottom:6px;color:var(--navy);">Loading latest medical research…</h3>
      <p style="color:var(--gray-400);margin-bottom:20px;font-size:0.875rem;">
        Fetching directly from PubMed — no account needed.
      </p>
      <div style="display:flex;justify-content:center;gap:8px;align-items:center;">
        <div class="spinner"></div>
        <span id="liveLoadMsg" style="font-size:0.8rem;color:var(--gray-400);">Searching…</span>
      </div>
    </div>`;

  const BASE    = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  const articles = [];

  for (let i = 0; i < LIVE_SEARCHES.length; i++) {
    const { q, cat } = LIVE_SEARCHES[i];
    const msg = document.getElementById('liveLoadMsg');
    if (msg) msg.textContent = `Fetching ${getCategoryLabel(cat).label}…`;

    try {
      // Search
      const searchRes = await fetch(
        `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}&retmax=3&retmode=json&sort=pub+date`
      );
      const searchData = await searchRes.json();
      const pmids = searchData?.esearchresult?.idlist || [];
      if (!pmids.length) continue;

      // Summaries
      const sumRes  = await fetch(`${BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`);
      const sumData = await sumRes.json();

      pmids.forEach(pmid => {
        const s = sumData?.result?.[pmid];
        if (!s || !s.title) return;

        const title   = s.title.replace(/\.$/, '');
        const journal = s.fulljournalname || s.source || '';
        const authors = (s.authors || []).slice(0, 2).map(a => a.name).join(', ')
                        + ((s.authors || []).length > 2 ? ' et al.' : '');
        // Use pubdate (human-readable like "2024 Jan 15") rather than sortpubdate
        // which PubMed uses "2026/12/30" as a placeholder sentinel for undated articles
        const rawDate = s.pubdate || s.epubdate || '';
        let publishedAt = new Date().toISOString();
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) publishedAt = d.toISOString();
        }
        const plain   = `${journal}${authors ? ` · ${authors}` : ''}`;
        const summary = plain.slice(0, 200);

        articles.push({
          id:           `live-${pmid}`,
          slug:         `pubmed-${pmid}`,
          title,
          summary,
          category:     cat,
          tags:         [],
          hero_image:   null,
          published_at: publishedAt,
          profiles:     { display_name: authors || 'PubMed' },
          _live:        true,   // flag — not from DB
        });
      });
    } catch {
      // Skip failed searches silently
    }
  }

  if (!articles.length) {
    showEmpty('articlesGrid', 'No articles found',
      'Could not fetch from PubMed. Check your connection and refresh.', '⚠️');
    return;
  }

  // Shuffle for variety
  articles.sort(() => Math.random() - 0.5);

  if (articles.length > 0) renderFeaturedArticle(articles[0]);
  renderArticleCards(articles.slice(1), grid);
  updateHeroStats(articles.length);

  // Show a subtle banner that content is live from PubMed
  const banner = document.createElement('div');
  banner.style.cssText = 'grid-column:1/-1;text-align:center;padding:12px;background:var(--teal-glow);border-radius:var(--radius-md);font-size:0.8rem;color:var(--teal-dark);border:1px solid rgba(0,180,216,0.2);';
  banner.innerHTML = '🔬 Showing live results from <strong>PubMed</strong>. Articles are saved to the database automatically every 6 hours via the scheduled worker.';
  grid.prepend(banner);
}

// ── Renderers ────────────────────────────────────────────────

function renderPage(data, count) {
  if (currentPage === 1 && !currentCategory && !currentTag) {
    renderFeaturedArticle(data[0]);
    renderArticleCards(data.slice(1), document.getElementById('articlesGrid'));
  } else {
    hideFeaturedSection();
    renderArticleCards(data, document.getElementById('articlesGrid'));
  }
  renderPagination(count);
  updateHeroStats(count);
}

function renderFeaturedArticle(article) {
  const container = document.getElementById('featuredArticle');
  if (!container) return;
  const cat    = getCategoryLabel(article.category);
  const author = article.profiles?.display_name || 'PubMed';
  const href   = article._live
    ? `https://pubmed.ncbi.nlm.nih.gov/${article.slug.replace('pubmed-','')}/`
    : `/article.html?slug=${encodeURIComponent(article.slug)}`;
  const target = article._live ? ' target="_blank" rel="noopener"' : '';

  container.innerHTML = `
    <article class="featured-article">
      <div class="featured-article-body">
        <div>
          <div class="featured-article-meta">
            <span class="badge badge-teal">${escHtml(cat.emoji)} ${escHtml(cat.label)}</span>
            <span class="dot-sep"></span>
            <span class="text-muted">${formatDate(article.published_at)}</span>
          </div>
          <h2><a href="${href}"${target}>${escHtml(article.title)}</a></h2>
          <p class="featured-article-summary">${escHtml(article.summary || '')}</p>
        </div>
        <div class="featured-article-footer">
          <div class="article-card-author">
            <div class="author-avatar">${escHtml(author.slice(0,2).toUpperCase())}</div>
            <span style="font-size:0.875rem;color:var(--gray-600);">${escHtml(author)}</span>
          </div>
          <a href="${href}"${target} class="btn btn-primary btn-sm">Read Article →</a>
        </div>
      </div>
      <div class="featured-article-img">
        <div class="featured-article-img-placeholder">🏥</div>
      </div>
    </article>`;
  // Featured article is always immediately visible — no scroll-trigger needed
  container.querySelector('.featured-article')?.classList.add('visible');
}
}

function hideFeaturedSection() {
  const c = document.getElementById('featuredArticle');
  if (c) c.innerHTML = '';
}

function renderArticleCards(articles, container) {
  if (!container || !articles.length) return;
  container.innerHTML = articles.map(a => articleCardHtml(a)).join('');
  requestAnimationFrame(() => {
    container.querySelectorAll('[data-animate]').forEach((el, i) => {
      el.style.transitionDelay = `${i * 50}ms`;
      setTimeout(() => el.classList.add('visible'), 10);
    });
  });
}

function articleCardHtml(article) {
  const cat    = getCategoryLabel(article.category);
  const author = article.profiles?.display_name || 'PubMed';
  const href   = article._live
    ? `https://pubmed.ncbi.nlm.nih.gov/${article.slug.replace('pubmed-','')}/`
    : `/article.html?slug=${encodeURIComponent(article.slug)}`;
  const target = article._live ? ' target="_blank" rel="noopener"' : '';

  return `
    <article class="card article-card" data-animate>
      <div class="article-card-img">
        <div class="article-card-img-placeholder">🏥</div>
      </div>
      <div class="article-card-body">
        <div class="article-card-meta">
          <span class="badge badge-teal" style="font-size:0.7rem;">${escHtml(cat.emoji)} ${escHtml(cat.label)}</span>
        </div>
        <h3 class="article-card-title">
          <a href="${href}"${target}>${escHtml(article.title)}</a>
        </h3>
        <p class="article-card-summary">${escHtml(article.summary || '')}</p>
        <div class="article-card-footer">
          <div class="article-card-author">
            <div class="author-avatar">${escHtml(author.slice(0,2).toUpperCase())}</div>
            <span>${escHtml(author)}</span>
          </div>
          <span>${formatDate(article.published_at, 'short')}</span>
        </div>
      </div>
    </article>`;
}

function showSkeletons(grid) {
  grid.innerHTML = Array(6).fill(0).map(() => `
    <div class="card article-card">
      <div class="article-card-img skeleton"></div>
      <div class="article-card-body">
        <div class="skeleton skeleton-text" style="width:80px;"></div>
        <div class="skeleton skeleton-title"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text" style="width:80%;"></div>
      </div>
    </div>`).join('');
}

function renderPagination(total) {
  const el = document.getElementById('pagination');
  if (!el) return;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  const params = new URLSearchParams(window.location.search);
  const pages  = [];
  pages.push(`<button class="page-btn" ${currentPage<=1?'disabled':''} onclick="window.location.search='?${buildPageParams(params,currentPage-1)}'">←</button>`);
  const start = Math.max(1, currentPage-2), end = Math.min(totalPages, start+4);
  if (start > 1) pages.push(`<span style="padding:0 6px;color:var(--gray-400);">…</span>`);
  for (let p = start; p <= end; p++) {
    pages.push(`<button class="page-btn ${p===currentPage?'active':''}" onclick="window.location.search='?${buildPageParams(params,p)}'">${p}</button>`);
  }
  if (end < totalPages) pages.push(`<span style="padding:0 6px;color:var(--gray-400);">…</span>`);
  pages.push(`<button class="page-btn" ${currentPage>=totalPages?'disabled':''} onclick="window.location.search='?${buildPageParams(params,currentPage+1)}'">→</button>`);
  el.innerHTML = pages.join('');
}

function buildPageParams(params, page) {
  const p = new URLSearchParams(params); p.set('page', page); return p.toString();
}

function updateHeroStats(count) {
  const el = document.getElementById('statArticles');
  if (el) el.textContent = count > 999 ? `${(count/1000).toFixed(1)}k` : count;
}

function populateFiltersBar(categories) {
  const bar   = document.getElementById('filtersBar');
  const inner = document.getElementById('filtersInner');
  if (!inner) return;
  if (bar) bar.style.display = '';
  const allActive = !currentCategory && !currentTag ? 'active' : '';
  inner.innerHTML = `
    <span class="filter-label">Filter:</span>
    <a href="/" class="tag ${allActive}">All</a>
    ${categories.slice(0, 14).map(cat => {
      const c = getCategoryLabel(cat);
      const active = currentCategory === cat ? 'active' : '';
      return `<a href="/?category=${encodeURIComponent(cat)}" class="tag ${active}">${escHtml(c.label)}</a>`;
    }).join('')}
  `;
  const statCats = document.getElementById('statCategories');
  if (statCats) statCats.textContent = CATEGORIES.length;
}

// ── Single Article Page ──────────────────────────────────────

export async function initArticlePage() {
  const params = new URLSearchParams(window.location.search);
  const slug   = params.get('slug');

  populateCategoriesDropdown(CATEGORIES.map(c => c.value));

  if (!slug) { renderArticleError('No article slug specified.', true); return; }

  const { data: article, error } = await fetchArticleBySlug(slug);
  if (error || !article) { renderArticleError('Article not found or no longer available.', true); return; }

  document.title = `${article.title} — MedPulse`;
  document.getElementById('metaDesc')?.setAttribute('content', article.summary || '');
  document.getElementById('ogTitle')?.setAttribute('content', article.title);
  document.getElementById('ogDesc')?.setAttribute('content', article.summary || '');
  if (article.hero_image) document.getElementById('ogImage')?.setAttribute('content', article.hero_image);

  renderArticleHero(article);
  renderArticleBody(article);
  renderArticleSidebar(article);

  // Load likes and comments after main render
  const user = await getCurrentUser();
  await initLikes(article.id, user);
  await initComments(article.id, user);
}

function renderArticleHero(article) {
  const cat    = getCategoryLabel(article.category);
  const heroContent = document.getElementById('articleHeroContent');
  if (heroContent) {
    heroContent.innerHTML = `
      <div class="article-hero-meta">
        <span class="badge badge-teal">${escHtml(cat.emoji)} ${escHtml(cat.label)}</span>
        <span class="dot-sep"></span>
        <span class="text-muted">${formatDate(article.published_at)}</span>
        <span class="dot-sep"></span>
        <span class="read-time">⏱ ${readTime(article.body || '')}</span>
      </div>
      <h1>${escHtml(article.title)}</h1>
      ${article.summary ? `<p class="article-hero-summary">${escHtml(article.summary)}</p>` : ''}`;
  }
  const imgWrap = document.getElementById('articleHeroImgWrap');
  if (imgWrap && article.hero_image) {
    imgWrap.innerHTML = `<div class="article-hero-img-wrap container">
      <img src="${escHtml(article.hero_image)}" alt="${escHtml(article.title)}" loading="eager" />
    </div>`;
  }
}

function renderArticleBody(article) {
  const bodyEl = document.getElementById('articleBody');
  if (!bodyEl) return;
  const safeHtml = article.body ? sanitizeHtml(article.body) : '<p><em>No content available.</em></p>';
  bodyEl.innerHTML = `
    <div class="article-content fade-in">${safeHtml}</div>
    <div class="divider" style="margin-top:40px;"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:24px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <button class="like-btn" id="likeBtn">
          <span class="like-heart">🤍</span>
          <span class="like-count" id="likeCount">—</span>
        </button>
        ${(article.tags||[]).map(t=>`<a href="/?tag=${encodeURIComponent(t)}" class="tag">${escHtml(t)}</a>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" id="shareArticleBtn">🔗 Share</button>
    </div>
    <div class="comments-section" id="commentsSection">
      <h3>💬 Discussion</h3>
      <div id="commentFormWrap"></div>
      <div id="commentsList"><div class="comments-empty">Loading comments…</div></div>
    </div>`;
  document.getElementById('shareArticleBtn')?.addEventListener('click', async () => {
    if (navigator.share) { await navigator.share({ title: article.title, url: location.href }); }
    else {
      if (await copyToClipboard(location.href)) showToast('Link copied!', 'success');
    }
  });
}

async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

function renderArticleSidebar(article) {
  const sidebar = document.getElementById('articleSidebar');
  if (!sidebar) return;
  const author = article.profiles?.display_name || 'MedPulse Staff';
  const cat    = getCategoryLabel(article.category);
  sidebar.innerHTML = `
    <div class="sidebar-card">
      <h4>About the Author</h4>
      <div class="author-card">
        <div class="author-avatar-lg">${escHtml(author.slice(0,2).toUpperCase())}</div>
        <div><strong>${escHtml(author)}</strong><p style="font-size:0.8rem;color:var(--gray-400);margin-top:4px;">Contributing Author</p></div>
      </div>
    </div>
    <div class="sidebar-card">
      <h4>Article Details</h4>
      <div style="display:flex;flex-direction:column;gap:12px;font-size:0.875rem;">
        <div><div style="color:var(--gray-400);font-size:0.75rem;margin-bottom:3px;">Category</div>
          <span class="badge badge-teal">${escHtml(cat.emoji)} ${escHtml(cat.label)}</span></div>
        <div><div style="color:var(--gray-400);font-size:0.75rem;margin-bottom:3px;">Published</div>
          <strong>${formatDate(article.published_at)}</strong></div>
        <div><div style="color:var(--gray-400);font-size:0.75rem;margin-bottom:3px;">Read Time</div>
          <strong>${readTime(article.body||'')}</strong></div>
        ${(article.tags||[]).length?`<div><div style="color:var(--gray-400);font-size:0.75rem;margin-bottom:6px;">Tags</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${article.tags.map(t=>`<a href="/?tag=${encodeURIComponent(t)}" class="tag" style="font-size:0.75rem;">${escHtml(t)}</a>`).join('')}
          </div></div>`:''}
      </div>
    </div>
    <a href="/" class="btn btn-secondary" style="width:100%;justify-content:center;">← Back to All Articles</a>`;
}

// ── Likes ────────────────────────────────────────────────────

async function initLikes(articleId, user) {
  const btn   = document.getElementById('likeBtn');
  const count = document.getElementById('likeCount');
  if (!btn || !count) return;

  // Fetch current like count + user's status
  const [{ count: total }, { liked }] = await Promise.all([
    fetchLikes(articleId),
    user ? fetchUserLike(articleId, user.id) : Promise.resolve({ liked: false }),
  ]);

  count.textContent = total || 0;
  if (liked) {
    btn.classList.add('liked');
    btn.querySelector('.like-heart').textContent = '❤️';
  }

  btn.addEventListener('click', async () => {
    if (!user) { openAuthModal(); return; }
    btn.disabled = true;
    const { liked: nowLiked, count: newCount } = await toggleLike(articleId, user.id);
    btn.disabled = false;
    count.textContent = newCount;
    btn.classList.toggle('liked', nowLiked);
    btn.querySelector('.like-heart').textContent = nowLiked ? '❤️' : '🤍';
  });
}

// ── Comments ─────────────────────────────────────────────────

async function initComments(articleId, user) {
  renderCommentForm(articleId, user);
  await loadComments(articleId, user);
}

function renderCommentForm(articleId, user) {
  const wrap = document.getElementById('commentFormWrap');
  if (!wrap) return;
  if (!user) {
    wrap.innerHTML = `
      <div class="comment-login-prompt">
        💬 <span><a href="#" id="commentLoginLink" style="color:var(--teal);font-weight:600;">Sign in</a>
        or <a href="#" id="commentRegisterLink" style="color:var(--teal);font-weight:600;">create an account</a>
        to join the discussion.</span>
      </div>`;
    wrap.querySelector('#commentLoginLink')?.addEventListener('click', e => { e.preventDefault(); openAuthModal(); });
    wrap.querySelector('#commentRegisterLink')?.addEventListener('click', e => { e.preventDefault(); openAuthModal('register'); });
    return;
  }
  wrap.innerHTML = `
    <div class="comment-form">
      <div id="commentAlert"></div>
      <textarea id="commentText" placeholder="Share your thoughts on this research…" maxlength="1000"></textarea>
      <div class="comment-form-footer">
        <span class="comment-char-count"><span id="commentChars">0</span>/1000</span>
        <button class="btn btn-primary btn-sm" id="submitCommentBtn">Post Comment</button>
      </div>
    </div>`;
  const textarea = wrap.querySelector('#commentText');
  const charsEl  = wrap.querySelector('#commentChars');
  textarea.addEventListener('input', () => { charsEl.textContent = textarea.value.length; });
  wrap.querySelector('#submitCommentBtn').addEventListener('click', async () => {
    const body = textarea.value.trim();
    if (body.length < 2) return;
    const btn = wrap.querySelector('#submitCommentBtn');
    btn.disabled = true; btn.textContent = 'Posting…';
    const { error } = await addComment(articleId, user.id, body);
    btn.disabled = false; btn.textContent = 'Post Comment';
    if (error) { showToast('Could not post comment.', 'error'); return; }
    textarea.value = ''; charsEl.textContent = '0';
    showToast('Comment posted!', 'success');
    await loadComments(articleId, user);
  });
}

async function loadComments(articleId, user) {
  const list = document.getElementById('commentsList');
  if (!list) return;
  const { data: comments, error } = await fetchComments(articleId);
  if (error) { list.innerHTML = '<div class="comments-empty">Could not load comments.</div>'; return; }
  if (!comments.length) { list.innerHTML = '<div class="comments-empty">No comments yet. Be the first to share your thoughts!</div>'; return; }
  list.innerHTML = comments.map(c => {
    const initials = (c.display_name || 'User').slice(0, 2).toUpperCase();
    const isOwn    = user && c.user_id === user.id;
    return `
      <div class="comment-card" data-comment-id="${escHtml(c.id)}">
        <div class="comment-avatar">${escHtml(initials)}</div>
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-author">${escHtml(c.display_name || 'Anonymous')}</span>
            <span class="comment-date">${formatDate(c.created_at)}</span>
            ${isOwn ? `<button class="comment-delete-btn" data-del="${escHtml(c.id)}">✕ Delete</button>` : ''}
          </div>
          <p class="comment-text">${escHtml(c.body)}</p>
        </div>
      </div>`;
  }).join('');
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { error: delErr } = await deleteComment(btn.dataset.del, user.id);
      if (!delErr) { showToast('Comment deleted.', 'info'); await loadComments(articleId, user); }
    });
  });
}

function renderArticleError(message, showBackBtn = false) {
  const bodyEl = document.getElementById('articleBody');
  const heroContent = document.getElementById('articleHeroContent');
  if (heroContent) heroContent.innerHTML = '';
  if (bodyEl) bodyEl.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">⚠️</div>
      <h3>Article Not Found</h3>
      <p>${escHtml(message)}</p>
      ${showBackBtn ? '<a href="/" class="btn btn-primary">← Back to Home</a>' : ''}
    </div>`;
}
