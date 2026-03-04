-- ============================================================
-- 002_rls_policies.sql
-- MedPulse — Row Level Security Policies
--
-- Run AFTER 001_create_tables.sql
-- ============================================================

-- ── Enable RLS on all tables ─────────────────────────────────

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ARTICLES POLICIES
-- ============================================================

-- Drop existing policies (for idempotent re-runs)
DROP POLICY IF EXISTS "articles_public_select"   ON public.articles;
DROP POLICY IF EXISTS "articles_author_select"   ON public.articles;
DROP POLICY IF EXISTS "articles_editor_select"   ON public.articles;
DROP POLICY IF EXISTS "articles_author_insert"   ON public.articles;
DROP POLICY IF EXISTS "articles_author_update"   ON public.articles;
DROP POLICY IF EXISTS "articles_author_delete"   ON public.articles;
DROP POLICY IF EXISTS "articles_editor_update"   ON public.articles;
DROP POLICY IF EXISTS "articles_editor_delete"   ON public.articles;

-- ── READ: Public can see published articles ──────────────────
CREATE POLICY "articles_public_select"
  ON public.articles
  FOR SELECT
  USING (status = 'published');

-- ── READ: Authors can see their own drafts/archived ──────────
CREATE POLICY "articles_author_select"
  ON public.articles
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
  );

-- ── READ: Editors and Admins see ALL articles ────────────────
CREATE POLICY "articles_editor_select"
  ON public.articles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role IN ('editor', 'admin')
    )
  );

-- ── INSERT: Any authenticated author can create articles ─────
CREATE POLICY "articles_author_insert"
  ON public.articles
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role IN ('author', 'editor', 'admin')
    )
  );

-- ── UPDATE: Authors can edit their OWN articles ──────────────
CREATE POLICY "articles_author_update"
  ON public.articles
  FOR UPDATE
  USING   (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- ── DELETE: Authors can delete their OWN articles ────────────
CREATE POLICY "articles_author_delete"
  ON public.articles
  FOR DELETE
  USING (author_id = auth.uid());

-- ── UPDATE: Editors and Admins can update ANY article ────────
CREATE POLICY "articles_editor_update"
  ON public.articles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role IN ('editor', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role IN ('editor', 'admin')
    )
  );

-- ── DELETE: Editors and Admins can delete ANY article ────────
CREATE POLICY "articles_editor_delete"
  ON public.articles
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role IN ('editor', 'admin')
    )
  );

-- ============================================================
-- PROFILES POLICIES
-- ============================================================

DROP POLICY IF EXISTS "profiles_public_select"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_select"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_insert"     ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all"      ON public.profiles;

-- ── READ: Author names visible to public (for article attribution)
CREATE POLICY "profiles_public_select"
  ON public.profiles
  FOR SELECT
  USING (true);  -- display_name is non-sensitive public info

-- ── INSERT: Users can create their own profile ───────────────
CREATE POLICY "profiles_own_insert"
  ON public.profiles
  FOR INSERT
  WITH CHECK (id = auth.uid());

-- ── UPDATE: Users can update their own profile ───────────────
CREATE POLICY "profiles_own_update"
  ON public.profiles
  FOR UPDATE
  USING   (id = auth.uid())
  WITH CHECK (
    id   = auth.uid()
    -- Prevent self-promotion to admin/editor
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- ── ALL: Admins can manage any profile ───────────────────────
CREATE POLICY "profiles_admin_all"
  ON public.profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id   = auth.uid()
        AND p.role = 'admin'
    )
  );

-- ============================================================
-- STORAGE POLICIES
-- (Run in Supabase Dashboard → Storage → Policies,
--  or use the SQL below if using the SQL editor)
-- ============================================================

-- Create the storage bucket (run once):
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('article-images', 'article-images', true)
-- ON CONFLICT DO NOTHING;

-- Allow public read of images:
-- CREATE POLICY "storage_public_read"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'article-images');

-- Allow authenticated authors to upload:
-- CREATE POLICY "storage_auth_upload"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'article-images'
--     AND auth.role() = 'authenticated'
--   );

-- Allow owners to delete their own images:
-- CREATE POLICY "storage_owner_delete"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'article-images'
--     AND owner = auth.uid()
--   );

-- ============================================================
-- SEED DATA (optional — uncomment to test)
-- ============================================================

-- To create an admin user:
-- 1. Create a user in Supabase Auth (Dashboard → Authentication → Users → Add user)
-- 2. Update their role:
--    UPDATE public.profiles SET role = 'admin' WHERE id = '<user-uuid>';
