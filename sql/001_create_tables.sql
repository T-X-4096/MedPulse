-- ============================================================
-- 001_create_tables.sql
-- MedPulse Medical News Platform — Initial Schema
--
-- Run this in your Supabase SQL Editor:
--   Supabase Dashboard → SQL Editor → New Query → paste & run
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Profiles Table ──────────────────────────────────────────
-- Extends Supabase's auth.users with role and display name.

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  role         text        NOT NULL DEFAULT 'author'
                           CHECK (role IN ('admin', 'editor', 'author')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles               IS 'User profiles extending Supabase auth';
COMMENT ON COLUMN public.profiles.role          IS 'admin | editor | author';
COMMENT ON COLUMN public.profiles.display_name  IS 'Public display name shown on articles';

-- ── Articles Table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.articles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text        NOT NULL,
  slug         text        NOT NULL UNIQUE,
  summary      text,
  body         text,
  category     text,
  tags         text[]      DEFAULT '{}',
  hero_image   text,                          -- public URL from Supabase Storage
  status       text        NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'published', 'archived')),
  author_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.articles             IS 'Medical news articles';
COMMENT ON COLUMN public.articles.slug        IS 'URL-safe unique identifier';
COMMENT ON COLUMN public.articles.tags        IS 'Array of lowercase tag strings';
COMMENT ON COLUMN public.articles.hero_image  IS 'Public URL from Supabase Storage';
COMMENT ON COLUMN public.articles.status      IS 'draft | published | archived';

-- ── Indexes ──────────────────────────────────────────────────
-- Critical for performance with 10,000+ articles

CREATE INDEX IF NOT EXISTS idx_articles_status
  ON public.articles (status);

CREATE INDEX IF NOT EXISTS idx_articles_slug
  ON public.articles (slug);

CREATE INDEX IF NOT EXISTS idx_articles_published_at
  ON public.articles (published_at DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_articles_category
  ON public.articles (category)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_articles_author_id
  ON public.articles (author_id);

CREATE INDEX IF NOT EXISTS idx_articles_tags
  ON public.articles USING gin (tags);

-- ── Auto-update updated_at trigger ──────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Auto-create profile on user signup ──────────────────────
-- Supabase calls this function on auth.users INSERT

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'author'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if present then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
