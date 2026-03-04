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
  if (error) return { total: 0, published: 0, drafts: 0, archived: 0, error };

  const total     = data.length;
  const published = data.filter(a => a.status === 'published').length;
  const drafts    = data.filter(a => a.status === 'draft').length;
  const archived  = data.filter(a => a.status === 'archived').length;

  return { total, published, drafts, archived, error: null };
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
