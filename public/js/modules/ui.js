/**
 * ui.js — Shared UI utilities
 *
 * Toast notifications, skeleton loaders, scroll animations,
 * date formatting, HTML escaping, and other shared helpers.
 */

// ── Toast Notifications ──────────────────────────────────────

const TOAST_DURATION = 4000;
const ICONS = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} [duration]
 */
export function showToast(message, type = 'info', duration = TOAST_DURATION) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
    <span class="toast-msg">${escHtml(message)}</span>
    <button class="toast-close" aria-label="Dismiss">✕</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  container.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), duration);
  toast._timer = timer;
}

function dismissToast(toast) {
  clearTimeout(toast._timer);
  toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(24px)';
  setTimeout(() => toast.remove(), 300);
}

// ── Confirm Dialog ───────────────────────────────────────────

/**
 * Show a confirmation dialog.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirm(title, message) {
  return new Promise(resolve => {
    const overlay = document.getElementById('confirmOverlay');
    if (!overlay) {
      resolve(window.confirm(message));
      return;
    }

    document.getElementById('confirmTitle').textContent  = title;
    document.getElementById('confirmMessage').textContent = message;
    overlay.classList.add('open');

    const ok     = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');

    function cleanup(result) {
      overlay.classList.remove('open');
      ok.replaceWith(ok.cloneNode(true));
      cancel.replaceWith(cancel.cloneNode(true));
      resolve(result);
    }

    document.getElementById('confirmOk').addEventListener('click', () => cleanup(true),   { once: true });
    document.getElementById('confirmCancel').addEventListener('click', () => cleanup(false), { once: true });
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(false); }, { once: true });
  });
}

// ── Loading helpers ──────────────────────────────────────────

/**
 * Show a centered spinner inside a container.
 * @param {string|HTMLElement} containerOrId
 * @param {string} [label]
 */
export function showLoading(containerOrId, label = 'Loading…') {
  const el = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!el) return;
  el.innerHTML = `
    <div class="loading-center">
      <div class="spinner spinner-lg"></div>
      <span>${escHtml(label)}</span>
    </div>`;
}

/**
 * Show an empty state.
 * @param {string|HTMLElement} containerOrId
 * @param {string} title
 * @param {string} [message]
 * @param {string} [icon]
 * @param {string} [actionHtml]
 */
export function showEmpty(containerOrId, title, message = '', icon = '📭', actionHtml = '') {
  const el = typeof containerOrId === 'string'
    ? document.getElementById(containerOrId)
    : containerOrId;
  if (!el) return;
  el.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h3>${escHtml(title)}</h3>
      ${message ? `<p>${escHtml(message)}</p>` : ''}
      ${actionHtml}
    </div>`;
}

// ── Date Formatting ──────────────────────────────────────────

/**
 * Format a date string for display.
 * @param {string} dateStr
 * @param {'long'|'short'} [style]
 */
export function formatDate(dateStr, style = 'long') {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (isNaN(date)) return '—';

  // Sanitize PubMed sentinel dates:
  // Dec 30 of any year = PubMed's "no date" placeholder
  // Any year more than 1 year ahead = bogus future date
  const month = date.getUTCMonth(); // 0-indexed, 11 = December
  const day   = date.getUTCDate();
  const year  = date.getUTCFullYear();
  const currentYear = new Date().getFullYear();
  if ((month === 11 && day === 30) || year > currentYear + 1) return 'Recent';

  return date.toLocaleDateString('en-US', {
    year:  'numeric',
    month: style === 'long' ? 'long' : 'short',
    day:   'numeric',
  });
}

/**
 * Format a date as relative time (e.g., "3 days ago").
 * @param {string} dateStr
 */
export function relativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);

  if (mins  < 1)   return 'just now';
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  return formatDate(dateStr, 'short');
}

/**
 * Estimate article read time.
 * @param {string} body - article body text/html
 */
export function readTime(body = '') {
  const text = body.replace(/<[^>]+>/g, '');
  const words = text.split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `${mins} min read`;
}

// ── Slug generation ──────────────────────────────────────────

/**
 * Convert a title string to a URL-safe slug.
 * @param {string} title
 */
export function slugify(title = '') {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

// ── HTML utilities ───────────────────────────────────────────

/**
 * Escape HTML special characters.
 * @param {string} str
 */
export function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Sanitise HTML for article body rendering.
 * Allows safe medical content tags while stripping dangerous elements.
 * @param {string} html
 */
export function sanitizeHtml(html = '') {
  const ALLOWED_TAGS = new Set([
    'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'sub', 'sup',
    'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'blockquote', 'pre', 'code',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr', 'figure', 'figcaption',
  ]);

  const ALLOWED_ATTRS = {
    a:   ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    td:  ['colspan', 'rowspan'],
    th:  ['colspan', 'rowspan', 'scope'],
  };

  const temp = document.createElement('div');
  temp.innerHTML = html;

  function clean(node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          // Replace with its children
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
          continue;
        }

        // Strip disallowed attributes
        const allowed = ALLOWED_ATTRS[tag] || [];
        for (const attr of [...child.attributes]) {
          if (!allowed.includes(attr.name)) {
            child.removeAttribute(attr.name);
          }
        }

        // Force links to open safely
        if (tag === 'a') {
          child.setAttribute('rel', 'noopener noreferrer');
          const href = child.getAttribute('href') || '';
          if (href.startsWith('javascript:')) child.removeAttribute('href');
        }

        clean(child);
      }
    }
  }

  clean(temp);
  return temp.innerHTML;
}

// ── Scroll Animations ────────────────────────────────────────

/**
 * Initialise intersection-observer based scroll animations.
 * Elements with `data-animate` attribute fade in when visible.
 */
export function initScrollAnimations() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('[data-animate]').forEach(el => el.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
}

// ── Nav mobile toggle ────────────────────────────────────────

/**
 * Wire up the mobile hamburger menu toggle.
 */
export function initNavToggle() {
  const btn   = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (!btn || !links) return;

  btn.addEventListener('click', () => {
    links.classList.toggle('open');
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!btn.contains(e.target) && !links.contains(e.target)) {
      links.classList.remove('open');
    }
  });
}

// ── Category dropdown ────────────────────────────────────────

/**
 * Populate the nav categories dropdown.
 * @param {string[]} categories
 */
export function populateCategoriesDropdown(categories) {
  const dropdown = document.getElementById('categoriesDropdown');
  if (!dropdown) return;

  // Accept either string[] or object[] with .value
  const values = (categories || []).map(c => typeof c === 'string' ? c : c.value).filter(Boolean);
  if (!values.length) return;

  dropdown.innerHTML = `
    <a href="/">All Articles</a>
    ${values.map(cat => {
      const label = cat.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      return `<a href="/?category=${encodeURIComponent(cat)}">${escHtml(label)}</a>`;
    }).join('')}
  `;
}

// ── Clipboard ────────────────────────────────────────────────

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Debounce ─────────────────────────────────────────────────

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
