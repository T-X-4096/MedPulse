# MedPulse — Complete Setup & Deployment Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [Local Development](#local-development)
4. [Cloudflare Pages Deployment](#cloudflare-pages-deployment)
5. [Environment Variables](#environment-variables)
6. [Storage Configuration](#storage-configuration)
7. [Creating Your First Admin User](#creating-your-first-admin-user)
8. [Architecture Notes](#architecture-notes)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- A Supabase account: https://supabase.com
- A Cloudflare account: https://cloudflare.com
- A GitHub or GitLab repository for your code
- A text editor and browser

---

## Supabase Setup

### 1. Create Project

1. Go to https://app.supabase.com → New Project
2. Name it `medpulse` (or your preference)
3. Choose a region close to your audience
4. Set a strong database password (save it!)
5. Wait ~2 minutes for provisioning

### 2. Get Your Credentials

In your Supabase project dashboard:
1. Go to **Settings → API**
2. Copy:
   - **Project URL** → e.g., `https://abcdefghij.supabase.co`
   - **anon public key** → `eyJhbGci...` (long JWT)
3. ⚠️ **NEVER** use the `service_role` key in frontend code

### 3. Run SQL Migrations

In your Supabase project:
1. Click **SQL Editor** in the sidebar → **New query**
2. Paste and run **each file** in order:

```
sql/001_create_tables.sql    ← Run first
sql/002_rls_policies.sql     ← Run second
sql/003_seed_data.sql        ← Run only for testing
```

### 4. Enable Email Authentication

1. Go to **Authentication → Providers**
2. Ensure **Email** is enabled
3. For development, go to **Authentication → Settings** and disable "Confirm email" 
   (re-enable in production)

### 5. Configure Email Templates (Production)

In **Authentication → Email Templates**, customise the confirmation and reset templates
to use your domain and branding.

---

## Storage Configuration

### Create the Storage Bucket

1. Go to **Storage** in your Supabase dashboard
2. Click **New bucket**
3. Name: `article-images`
4. Set to **Public** (images need to be publicly accessible)
5. Click **Save**

### Set Storage Policies

In your SQL editor, run:

```sql
-- Allow public read
CREATE POLICY "Public read article images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'article-images');

-- Allow authenticated authors to upload
CREATE POLICY "Authors can upload images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'article-images'
    AND auth.role() = 'authenticated'
  );

-- Allow owners to update their images
CREATE POLICY "Owners can update images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'article-images'
    AND owner = auth.uid()
  );

-- Allow owners to delete their images
CREATE POLICY "Owners can delete images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'article-images'
    AND owner = auth.uid()
  );
```

---

## Environment Variables

### What You Need

| Variable            | Description                        | Example                             |
|---------------------|------------------------------------|-------------------------------------|
| `SUPABASE_URL`      | Your Supabase project URL          | `https://abcdef.supabase.co`        |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public API key  | `eyJhbGciOiJIUzI1NiIsInR5cCI6...`  |

### How They're Injected

This project uses a **build-time replacement pattern** for Cloudflare Pages.

You have two options:

#### Option A: Cloudflare Pages Build Plugin (Recommended)
Add a `build` script that replaces placeholder strings in `config.js`:

In your `package.json`:
```json
{
  "scripts": {
    "build": "node scripts/inject-env.js"
  }
}
```

Create `scripts/inject-env.js`:
```javascript
const fs   = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../public/js/config.js');
let   content    = fs.readFileSync(configPath, 'utf8');

content = content
  .replace('__SUPABASE_URL__',      process.env.SUPABASE_URL      || '')
  .replace('__SUPABASE_ANON_KEY__', process.env.SUPABASE_ANON_KEY || '');

fs.writeFileSync(configPath, content);
console.log('✅ Environment variables injected');
```

#### Option B: window.__ENV__ via HTML snippet
Add this to the `<head>` of all HTML files before other scripts:
```html
<script>
  // Populated by Cloudflare Pages at build time via _worker.js
  window.__ENV__ = {
    SUPABASE_URL:      "__SUPABASE_URL__",
    SUPABASE_ANON_KEY: "__SUPABASE_ANON_KEY__"
  };
</script>
```

#### Option C: Direct edit for simple deployments
Simply replace the placeholder values directly in `public/js/config.js`:
```javascript
export const SUPABASE_URL      = 'https://your-project.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

---

## Local Development

Since this is a static site, you just need a local HTTP server:

### Using Python (no install required)
```bash
cd medical-news-platform/public
python3 -m http.server 8080
# Visit: http://localhost:8080
```

### Using Node.js serve
```bash
npm install -g serve
serve public -p 8080
```

### Using VS Code Live Server
Install the "Live Server" extension, right-click `index.html` → Open with Live Server.

### Edit config.js for local dev
Temporarily replace the placeholder values with your actual Supabase credentials
in `public/js/config.js` for local testing. **Don't commit these values.**

---

## Cloudflare Pages Deployment

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial MedPulse setup"
git remote add origin https://github.com/yourname/medpulse.git
git push -u origin main
```

### 2. Create Cloudflare Pages Project

1. Log into https://dash.cloudflare.com
2. Go to **Workers & Pages → Pages → Create application**
3. Click **Connect to Git** and authorise GitHub
4. Select your repository
5. Configure:
   - **Framework preset**: None
   - **Build command**: *(leave empty for static, or `node scripts/inject-env.js` if using build script)*
   - **Build output directory**: `public`
   - **Root directory**: `/` (or `medical-news-platform` if in a subdirectory)

### 3. Set Environment Variables

In your Cloudflare Pages project:
1. Go to **Settings → Environment variables**
2. Add for **Production** (and optionally **Preview**):

| Variable name       | Value                            |
|---------------------|----------------------------------|
| `SUPABASE_URL`      | `https://xxxx.supabase.co`       |
| `SUPABASE_ANON_KEY` | `eyJhbGci...` (your anon key)    |

### 4. Deploy

Click **Save and Deploy**. Cloudflare will:
1. Pull your code from GitHub
2. Run the build command (if set)
3. Deploy to their global CDN
4. Assign a `*.pages.dev` domain

### 5. Custom Domain (Optional)

In Pages project → **Custom domains → Add custom domain**. Follow DNS configuration instructions.

---

## Creating Your First Admin User

### Step 1: Create the user in Supabase Auth

1. Go to **Authentication → Users** in your Supabase dashboard
2. Click **Add user → Create new user**
3. Enter email and password
4. Click **Create user**

### Step 2: Promote to admin

In the SQL Editor:
```sql
-- Replace with the actual UUID from step 1
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'paste-user-uuid-here';

-- Verify
SELECT id, display_name, role FROM public.profiles;
```

### Step 3: Login

Navigate to your site, click **Sign In**, and use the credentials you just created.

---

## Role System

| Role     | Can view own drafts | Can edit own | Can edit others | Can manage all |
|----------|--------------------|--------------|-----------------|--------------  |
| `public` | ✗                  | ✗            | ✗               | ✗              |
| `author` | ✓                  | ✓            | ✗               | ✗              |
| `editor` | ✓                  | ✓            | ✓               | ✓              |
| `admin`  | ✓                  | ✓            | ✓               | ✓              |

To promote users, update the `role` column in `public.profiles` directly via SQL Editor.

---

## Architecture Notes

### Why No Build Step?

This project uses native ES Modules loaded directly in the browser, with Supabase JS
loaded from jsDelivr CDN. This means:
- Zero build tooling required
- No webpack, no vite, no npm install
- Deploy by copying files — it's that simple

### Supabase Client Initialisation

The Supabase JS v2 client is imported as an ES module from CDN:
```javascript
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
```

### CORS

Supabase automatically allows requests from any origin using the anon key.
Your Cloudflare Pages domain will work without additional CORS configuration.

### Security

- The `anon` key is safe to expose publicly — it's subject to RLS policies
- The `service_role` key bypasses RLS and must **never** appear in frontend code
- All sensitive operations (like role changes) should use a Cloudflare Worker with the service_role key

---

## Troubleshooting

### Articles not loading
- Check browser console for CORS or 401 errors
- Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set correctly in `config.js`
- Ensure RLS policies were applied (run `002_rls_policies.sql`)
- Confirm the `articles` table exists and has `status = 'published'` rows

### Login not working
- Ensure Email provider is enabled in Supabase Auth settings
- If "Email confirmation" is on, check the user's email for a confirmation link
- Check the Supabase Auth logs in Dashboard → Authentication → Logs

### Images not uploading
- Verify the `article-images` bucket exists and is set to Public
- Ensure storage policies are applied
- Check that the user is authenticated when attempting to upload

### Cloudflare Pages 404 on refresh
- Ensure `_redirects` file is in your `public` folder
- Verify build output directory is `public`

### Slug conflicts
- The slug field has a UNIQUE constraint — duplicate slugs will cause an insert error
- The dashboard form auto-generates slugs but you should verify uniqueness before publishing

---

## File Structure Reference

```
medical-news-platform/
├── public/                     ← Cloudflare Pages serves this
│   ├── index.html              ← Homepage
│   ├── article.html            ← Single article view
│   ├── dashboard.html          ← Author dashboard
│   ├── _redirects              ← Cloudflare routing rules
│   ├── _headers                ← Security headers
│   ├── css/
│   │   └── styles.css          ← All styles (no framework)
│   └── js/
│       ├── config.js           ← Supabase config & constants
│       ├── main.js             ← Homepage entry point
│       ├── article.js          ← Article page entry point
│       ├── dashboard-init.js   ← Dashboard entry point + auth guard
│       └── modules/
│           ├── api.js          ← All Supabase DB queries
│           ├── auth.js         ← Auth helpers + nav UI
│           ├── articles.js     ← Rendering logic
│           ├── dashboard.js    ← CRUD dashboard logic
│           ├── storage.js      ← Image upload helpers
│           └── ui.js           ← Shared UI utilities
└── sql/
    ├── 001_create_tables.sql   ← Schema + indexes + triggers
    ├── 002_rls_policies.sql    ← All RLS policies
    └── 003_seed_data.sql       ← Test data (dev only)
```
