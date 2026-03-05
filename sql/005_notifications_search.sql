-- ═══════════════════════════════════════════════════════════════
-- MedPulse — Migration: Notifications + Search
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ── 1. NOTIFICATIONS TABLE ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text        NOT NULL,           -- 'like' | 'comment'
  message      text        NOT NULL,
  article_slug text,                           -- slug to link back to
  actor_name   text,                           -- who triggered it
  read         boolean     DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users only see their own notifications
CREATE POLICY "notifs_select_own" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifs_update_own" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- System inserts via trigger (bypasses RLS because trigger runs as owner)
CREATE POLICY "notifs_insert_system" ON public.notifications
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS notifs_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifs_read_idx    ON public.notifications(user_id, read);


-- ── 2. TRIGGER: notify article author when someone LIKES ────
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_article       public.articles%ROWTYPE;
  v_actor_name    text;
  v_article_slug  text;
BEGIN
  -- Get article
  SELECT * INTO v_article FROM public.articles WHERE id = NEW.article_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Don't notify if user liked their own article
  IF v_article.author_id = NEW.user_id THEN RETURN NEW; END IF;

  -- Get actor display name
  SELECT display_name INTO v_actor_name FROM public.profiles WHERE id = NEW.user_id;
  v_actor_name := COALESCE(v_actor_name, 'Someone');

  INSERT INTO public.notifications (user_id, type, message, article_slug, actor_name)
  VALUES (
    v_article.author_id,
    'like',
    v_actor_name || ' liked your article: ' || LEFT(v_article.title, 60),
    v_article.slug,
    v_actor_name
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_like ON public.likes;
CREATE TRIGGER trg_notify_like
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();


-- ── 3. TRIGGER: notify article author when someone COMMENTS ─
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_article       public.articles%ROWTYPE;
  v_actor_name    text;
BEGIN
  SELECT * INTO v_article FROM public.articles WHERE id = NEW.article_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Don't notify if author commented on their own article
  IF v_article.author_id = NEW.user_id THEN RETURN NEW; END IF;

  SELECT display_name INTO v_actor_name FROM public.profiles WHERE id = NEW.user_id;
  v_actor_name := COALESCE(v_actor_name, 'Someone');

  INSERT INTO public.notifications (user_id, type, message, article_slug, actor_name)
  VALUES (
    v_article.author_id,
    'comment',
    v_actor_name || ' commented on your article: ' || LEFT(v_article.title, 60),
    v_article.slug,
    v_actor_name
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment ON public.comments;
CREATE TRIGGER trg_notify_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();


-- ── 4. FULL-TEXT SEARCH INDEX (optional but speeds up search)
-- The JS uses ilike which works without this, but this makes it faster:
CREATE INDEX IF NOT EXISTS articles_title_search_idx
  ON public.articles USING gin(to_tsvector('english', title));

CREATE INDEX IF NOT EXISTS articles_summary_search_idx
  ON public.articles USING gin(to_tsvector('english', coalesce(summary, '')));


-- ── 5. VERIFY ───────────────────────────────────────────────
SELECT 'notifications' AS tbl, COUNT(*) AS rows FROM public.notifications UNION ALL
SELECT 'articles',                COUNT(*) FROM public.articles            UNION ALL
SELECT 'likes',                   COUNT(*) FROM public.likes               UNION ALL
SELECT 'comments',                COUNT(*) FROM public.comments;
