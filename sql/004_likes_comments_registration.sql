-- ═══════════════════════════════════════════════════════════════
-- MedPulse — Migration: Likes, Comments, Reader Role (FIXED)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ── 1. LIKES TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.likes (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id  uuid    NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  user_id     uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(article_id, user_id)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes_select_all"  ON public.likes FOR SELECT USING (true);
CREATE POLICY "likes_insert_auth" ON public.likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes_delete_own"  ON public.likes FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS likes_article_id_idx ON public.likes(article_id);


-- ── 2. COMMENTS TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id  uuid    NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  user_id     uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text    NOT NULL,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT comment_body_length CHECK (char_length(body) >= 2 AND char_length(body) <= 1000)
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select_all"  ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_auth" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "comments_delete_own"  ON public.comments FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS comments_article_id_idx ON public.comments(article_id);
CREATE INDEX IF NOT EXISTS comments_user_id_idx    ON public.comments(user_id);


-- ── 3. JOIN comments → profiles (so display_name loads) ─────
-- Drop first in case it already exists from a previous attempt
ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_user_id_fkey_profiles;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_user_id_fkey_profiles
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


-- ── 4. VERIFY ───────────────────────────────────────────────
SELECT 'likes table'    AS check, COUNT(*) AS rows FROM public.likes    UNION ALL
SELECT 'comments table' AS check, COUNT(*) AS rows FROM public.comments UNION ALL
SELECT 'articles total' AS check, COUNT(*) AS rows FROM public.articles  UNION ALL
SELECT 'profiles total' AS check, COUNT(*) AS rows FROM public.profiles;
