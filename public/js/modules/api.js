/**
 * api.js — Supabase client + all database operations
 *
 * Initialises the Supabase JS client and exports typed query helpers
 * used across the application.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, PAGE_SIZE } from '../config.js';

// ── Supabase Client ──────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:  true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// ── Article Queries ──────────────────────────────────────────

/**
 * Fetch published articles with optional filtering and pagination.
 * @param {object} opts
 * @param {string}   [opts.category]  - filter by category
 * @param {string}   [opts.tag]       - filter by tag
 * @param {number}   [opts.page=1]    - page number (1-based)
 * @param {number}   [opts.pageSize]  - items per page
 * @returns {Promise<{data: Article[], count: number, error: Error|null}>}
 */
export async function fetchPublishedArticles({
  category = null,
  tag = null,
  page = 1,
  pageSize = PAGE_SIZE,
} = {}) {
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let query = supabase
    .from('articles')
    .select(`
      id, title, slug, summary, category, tags,
      hero_image, status, published_at, created_at,
      profiles ( display_name )
    `, { count: 'exact' })
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, to);

  if (category) query = query.eq('category', category);
  if (tag)      query = query.contains('tags', [tag]);

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

/**
 * Fetch a single published article by its slug.
 * @param {string} slug
 * @returns {Promise<{data: Article|null, error: Error|null}>}
 */
export async function fetchArticleBySlug(slug) {
  const { data, error } = await supabase
    .from('articles')
    .select(`
      *, profiles ( display_name )
    `)
    .eq('slug', slug)
    .eq('status', 'published')
    .single();

  return { data: data || null, error };
}

/**
 * Fetch articles for the authenticated author (all statuses).
 * @param {string} authorId
 * @returns {Promise<{data: Article[], error: Error|null}>}
 */
export async function fetchAuthorArticles(authorId) {
  const { data, error } = await supabase
    .from('articles')
    .select('id, title, slug, category, status, published_at, created_at, updated_at')
    .eq('author_id', authorId)
    .order('updated_at', { ascending: false });

  return { data: data || [], error };
}

/**
 * Fetch ALL articles (editor/admin only — RLS enforces this).
 * @returns {Promise<{data: Article[], error: Error|null}>}
 */
export async function fetchAllArticles() {
  const { data, error } = await supabase
    .from('articles')
    .select(`
      id, title, slug, category, status,
      published_at, created_at, updated_at,
      profiles ( display_name )
    `)
    .order('updated_at', { ascending: false });

  return { data: data || [], error };
}

/**
 * Create a new article.
 * @param {Partial<Article>} article
 * @returns {Promise<{data: Article|null, error: Error|null}>}
 */
export async function createArticle(article) {
  const { data, error } = await supabase
    .from('articles')
    .insert([article])
    .select()
    .single();

  return { data: data || null, error };
}

/**
 * Update an existing article by ID.
 * @param {string} id - article UUID
 * @param {Partial<Article>} updates
 * @returns {Promise<{data: Article|null, error: Error|null}>}
 */
export async function updateArticle(id, updates) {
  const { data, error } = await supabase
    .from('articles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  return { data: data || null, error };
}

/**
 * Delete an article by ID.
 * @param {string} id
 * @returns {Promise<{error: Error|null}>}
 */
export async function deleteArticle(id) {
  const { error } = await supabase
    .from('articles')
    .delete()
    .eq('id', id);

  return { error };
}

// ── Profile Queries ──────────────────────────────────────────

/**
 * Get a user's profile.
 * @param {string} userId
 * @returns {Promise<{data: Profile|null, error: Error|null}>}
 */
export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  return { data: data || null, error };
}

/**
 * Upsert a user profile.
 * @param {Partial<Profile>} profile
 * @returns {Promise<{data: Profile|null, error: Error|null}>}
 */
export async function upsertProfile(profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert([profile], { onConflict: 'id' })
    .select()
    .single();

  return { data: data || null, error };
}

// ── Stats helpers ────────────────────────────────────────────

/**
 * Get aggregate counts for overview stats.
 * @param {string} authorId - if provided, scoped to that author
 */
export async function fetchArticleStats(authorId = null) {
  let query = supabase.from('articles').select('status');
  if (authorId) query = query.eq('author_id', authorId);

  const { data, error } = await query;
  if (error) return { total: 0, published: 0, drafts: 0, error };

  const total     = data.length;
  const published = data.filter(a => a.status === 'published').length;
  const drafts    = data.filter(a => a.status === 'draft').length;

  return { total, published, drafts, error: null };
}

// ── Likes ────────────────────────────────────────────────────

export async function fetchLikes(articleId) {
  const { count, error } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('article_id', articleId);
  return { count: count || 0, error };
}

export async function fetchUserLike(articleId, userId) {
  const { data, error } = await supabase
    .from('likes')
    .select('id')
    .eq('article_id', articleId)
    .eq('user_id', userId)
    .maybeSingle();
  return { liked: !!data, error };
}

export async function toggleLike(articleId, userId) {
  const { liked } = await fetchUserLike(articleId, userId);
  if (liked) {
    await supabase.from('likes').delete()
      .eq('article_id', articleId).eq('user_id', userId);
  } else {
    await supabase.from('likes').insert([{ article_id: articleId, user_id: userId }]);
  }
  const { count } = await fetchLikes(articleId);
  return { liked: !liked, count };
}

// ── Comments ─────────────────────────────────────────────────

export async function fetchComments(articleId) {
  const { data, error } = await supabase
    .from('comments')
    .select('id, body, user_id, created_at, profiles(display_name)')
    .eq('article_id', articleId)
    .order('created_at', { ascending: true });

  const comments = (data || []).map(c => ({
    ...c,
    display_name: c.profiles?.display_name || 'Anonymous',
  }));
  return { data: comments, error };
}

export async function addComment(articleId, userId, body) {
  const { data, error } = await supabase
    .from('comments')
    .insert([{ article_id: articleId, user_id: userId, body }])
    .select()
    .single();
  return { data, error };
}

export async function deleteComment(commentId, userId) {
  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId);
  return { error };
}

/**
 * Get distinct categories from published articles.
 */
export async function fetchCategories() {
  const { data, error } = await supabase
    .from('articles')
    .select('category')
    .eq('status', 'published');

  if (error) return { data: [], error };

  const unique = [...new Set((data || []).map(a => a.category).filter(Boolean))];
  return { data: unique, error: null };
}

/**
 * Check if a slug is already taken (excluding a given article id).
 * @param {string} slug
 * @param {string} [excludeId]
 */
export async function isSlugTaken(slug, excludeId = null) {
  let query = supabase.from('articles').select('id').eq('slug', slug);
  if (excludeId) query = query.neq('id', excludeId);

  const { data } = await query;
  return (data || []).length > 0;
}

// ── Search ───────────────────────────────────────────────────

/**
 * Full-text search across title, summary, tags, category.
 * Uses Supabase ilike (case-insensitive pattern match).
 */
export async function searchArticles(query, { page = 1, pageSize = 12 } = {}) {
  if (!query?.trim()) return { data: [], count: 0, error: null };
  const q    = query.trim();
  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from('articles')
    .select(`id, title, slug, summary, category, tags, hero_image, status, published_at,
             profiles(display_name)`, { count: 'exact' })
    .eq('status', 'published')
    .or(`title.ilike.%${q}%,summary.ilike.%${q}%,category.ilike.%${q}%`)
    .order('published_at', { ascending: false })
    .range(from, to);

  return { data: data || [], count: count || 0, error };
}

// ── Notifications ────────────────────────────────────────────

export async function fetchNotifications(userId, limit = 20) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

export async function fetchUnreadCount(userId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);
  return { count: count || 0, error };
}

export async function markAllRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);
  return { error };
}

export async function markOneRead(notifId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notifId);
  return { error };
}

// ── Admin: user management ───────────────────────────────────

export async function fetchAllProfiles(search = '') {
  let query = supabase
    .from('profiles')
    .select('id, display_name, role, created_at')
    .order('created_at', { ascending: false });
  if (search.trim()) {
    query = query.ilike('display_name', `%${search.trim()}%`);
  }
  const { data, error } = await query;
  return { data: data || [], error };
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);
  return { error };
}

// ── Delete account ───────────────────────────────────────────

export async function deleteUserAccount(userId) {
  // Delete profile (cascades to comments/likes via DB FKs)
  // Auth user deletion requires server-side (service role) or Supabase UI
  // We soft-delete by wiping profile data and signing out
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);
  return { error };
}
