# MedPulse — Setup and Deployment Guide

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Supabase Setup](#2-supabase-setup)
3. [Database Migrations](#3-database-migrations)
4. [Storage Configuration](#4-storage-configuration)
5. [Application Configuration](#5-application-configuration)
6. [Local Development](#6-local-development)
7. [Cloudflare Pages Deployment](#7-cloudflare-pages-deployment)
8. [Creating the First Admin Account](#8-creating-the-first-admin-account)
9. [Cloudflare Worker (Scheduled Import)](#9-cloudflare-worker-scheduled-import)
10. [Role System](#10-role-system)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

- A Supabase account: https://supabase.com
- A Cloudflare account: https://cloudflare.com
- A GitHub repository for the code
- A modern browser and a text editor

No Node.js, no build tools, and no npm installs are required to run the frontend.

---

## 2. Supabase Setup

### Create a project

1. Go to https://app.supabase.com and click New Project
2. Give it a name (e.g. medpulse)
3. Choose a region close to your audience
4. Set a strong database password and save it
5. Wait approximately two minutes for provisioning

### Get your credentials

1. In the Supabase dashboard, go to Settings > API
2. Copy the Project URL (e.g. https://abcdefgh.supabase.co)
3. Copy the anon public key (the long JWT string beginning with eyJ)

Keep these values. You will need them in step 5.

Do not use the service_role key in frontend code. It bypasses all security policies.

### Enable email authentication

1. Go to Authentication > Providers
2. Confirm that Email is enabled
3. For local development, go to Authentication > Settings and disable Confirm email so you can sign in immediately
4. Re-enable email confirmation before going to production

---

## 3. Database Migrations

All migrations are in the `sql/` directory. Run them in order using the Supabase SQL Editor.

For each file: Supabase Dashboard > SQL Editor > New query > paste the file contents > Run.

| File                                    | What it creates                                          |
|-----------------------------------------|----------------------------------------------------------|
| 001_create_tables.sql                   | profiles, articles tables, indexes, and triggers         |
| 002_rls_policies.sql                    | Row Level Security policies for all tables               |
| 003_seed_data.sql                       | Sample articles for development only, do not run in prod |
| 004_likes_comments_registration.sql     | likes, comments tables and reader role support           |
| 005_notifications_search.sql            | notifications table and database triggers for likes/comments |

Run them in this exact order. Each migration depends on the previous one.

---

## 4. Storage Configuration

Article hero images are stored in a Supabase Storage bucket.

### Create the bucket

1. Go to Storage in the Supabase dashboard
2. Click New bucket
3. Name: article-images
4. Set to Public (images must be publicly readable)
5. Click Save

### Set storage policies

In the SQL Editor, run:

```sql
-- Public read access
CREATE POLICY "storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'article-images');

-- Authenticated users can upload
CREATE POLICY "storage_auth_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'article-images'
    AND auth.role() = 'authenticated'
  );

-- Owners can delete their own images
CREATE POLICY "storage_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'article-images'
    AND owner = auth.uid()
  );
```

---

## 5. Application Configuration

Open `public/js/config.js` and set your Supabase credentials:

```javascript
export const SUPABASE_URL      = 'https://your-project-id.supabase.co';
export const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

Other values in config.js you may want to adjust:

| Constant             | Default | Description                                       |
|----------------------|---------|---------------------------------------------------|
| PAGE_SIZE            | 12      | Articles per page                                 |
| STORAGE_BUCKET       | article-images | Supabase Storage bucket name              |
| PUBMED_API_KEY       | (set)   | NCBI API key for higher rate limits               |
| PUBMED_MAX_RESULTS   | 100     | Max articles fetched per search term per import   |
| PUBMED_SEARCH_TERMS  | 37 terms| PubMed queries covering all 14 categories         |

To get a free NCBI API key (increases rate limit from 3 to 10 requests/second):
https://www.ncbi.nlm.nih.gov/account/

---

## 6. Local Development

The frontend is a static site. Any HTTP server will work.

Using Python (no install required):
```
cd public
python3 -m http.server 8080
```

Using Node.js serve:
```
npm install -g serve
serve public -p 8080
```

Using VS Code: install the Live Server extension, right-click index.html, and select Open with Live Server.

Open http://localhost:8080 in your browser.

---

## 7. Cloudflare Pages Deployment

### Push to GitHub

```
git add .
git commit -m "initial setup"
git push origin main
```

### Create a Pages project

1. Log into https://dash.cloudflare.com
2. Go to Workers and Pages > Pages > Create application
3. Click Connect to Git and authorise GitHub
4. Select your repository
5. Set the following build settings:
   - Framework preset: None
   - Build command: (leave empty)
   - Build output directory: public

### Deploy

Click Save and Deploy. Cloudflare will assign a .pages.dev subdomain. Every push to the main branch triggers a new deployment automatically.

### Custom domain (optional)

In the Pages project, go to Custom domains > Add custom domain and follow the DNS instructions.

---

## 8. Creating the First Admin Account

### Step 1: Create a user via Supabase Auth

1. Go to Authentication > Users in the Supabase dashboard
2. Click Add user > Create new user
3. Enter an email address and password
4. Click Create user

### Step 2: Promote the user to admin

In the SQL Editor:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = 'paste-the-user-uuid-here';
```

The user UUID is shown in Authentication > Users next to the user's email.

### Step 3: Sign in

Go to your site and click Sign In. Use the credentials you created. The Dashboard link will appear in the navigation bar.

---

## 9. Cloudflare Worker (Scheduled Import)

The Cloudflare Worker runs on a cron schedule and automatically imports new PubMed articles into the database every six hours. This is separate from the manual import available in the admin dashboard.

### Requirements

- Node.js installed locally (for Wrangler CLI)
- A Cloudflare account with Workers enabled

### Setup

Install Wrangler:
```
npm install -g wrangler
wrangler login
```

Set the required secrets:
```
cd worker
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put IMPORT_AUTHOR_ID
wrangler secret put PUBMED_API_KEY
```

For SUPABASE_SERVICE_KEY: use the service_role key from Supabase Settings > API. This key is safe here because it runs only in the server-side Worker environment, never in the browser.

For IMPORT_AUTHOR_ID: use the UUID of the admin user you created in step 8.

### Deploy the worker

```
wrangler deploy
```

The worker runs at 00:00, 06:00, 12:00, and 18:00 UTC daily.

### Cron schedule

The schedule is set in `worker/wrangler.toml`:
```
[triggers]
crons = ["0 */6 * * *"]
```

Adjust this to any valid cron expression if you want a different frequency.

---

## 10. Role System

| Role   | Description                                                         |
|--------|---------------------------------------------------------------------|
| reader | Can read, like, and comment. Cannot write articles.                 |
| author | Can write, edit, and delete their own articles.                     |
| editor | Can edit and delete any article.                                    |
| admin  | Full access: user management, role changes, PubMed import.          |

Self-registered users receive the reader role by default. To promote a user:

Option A: Use the Users panel in the admin dashboard.

Option B: Use the SQL Editor:
```sql
UPDATE public.profiles
SET role = 'author'  -- or editor, admin
WHERE id = 'user-uuid-here';
```

Users cannot promote themselves. The RLS policy on profiles prevents a user from updating their own role.

---

## 11. Troubleshooting

**Articles are not loading**
- Open the browser console and look for errors
- Confirm SUPABASE_URL and SUPABASE_ANON_KEY are correct in config.js
- Confirm migrations 001 and 002 ran without errors
- Check that the articles table contains rows with status = 'published'

**Sign in is not working**
- Confirm the Email provider is enabled in Supabase Authentication settings
- If email confirmation is required, check the inbox for a confirmation email
- Check Authentication > Logs in Supabase for detailed error messages

**Images are not uploading**
- Confirm the article-images bucket exists and is set to Public
- Confirm the storage policies in step 4 were applied
- The user must be authenticated to upload

**PubMed import returns no results**
- NCBI enforces rate limits. Without an API key, the limit is 3 requests per second
- If imports fail silently, check the browser console for network errors
- Try a single manual search in the Import panel before running auto-import

**Notifications are not appearing**
- Confirm migration 005 ran successfully
- The notification triggers fire on likes and comments. Try liking an article authored by another account and check that account's bell

**Cloudflare Pages shows a 404 on page refresh**
- Ensure a `_redirects` file exists in the `public/` directory with the content:
  ```
  /* /index.html 200
  ```
