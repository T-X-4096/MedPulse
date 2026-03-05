# MedPulse

A medical news platform that aggregates peer-reviewed research from PubMed and supports original authored content. Built with plain HTML, CSS, and vanilla JavaScript. No build tools required.

Live: https://medpulse.pages.dev

---

## Stack

| Layer    | Technology                           |
|----------|--------------------------------------|
| Frontend | HTML5, CSS3, Vanilla JS (ES Modules) |
| Database | Supabase (PostgreSQL)                |
| Auth     | Supabase Auth (email/password)       |
| Storage  | Supabase Storage                     |
| Hosting  | Cloudflare Pages                     |
| Imports  | NCBI PubMed E-utilities API          |

---

## Features

- Article listing with category filters, tag filters, and live search
- Featured article hero with responsive grid and pagination
- Email/password authentication with four-tier role system (reader, author, editor, admin)
- Author dashboard: write, edit, publish, and delete articles
- Hero image upload via drag-and-drop to Supabase Storage
- PubMed import: search and bulk-import research abstracts by specialty (admin only)
- Scheduled PubMed import via Cloudflare Worker on a 6-hour cron
- Likes and comments on articles with notification bell
- Admin user management: search users, change roles, delete accounts
- Policy pages: Editorial Policy, Privacy Policy, Terms of Use
- Zero build step: deploy by pushing the public/ folder

---

## Quick Start

1. Clone this repository
2. Create a Supabase project at https://supabase.com
3. Run the SQL migration files in `sql/` in numbered order (001 through 005)
4. Set your Supabase URL and anon key in `public/js/config.js`
5. Serve the `public/` directory:

```
cd public && python3 -m http.server 8080
```

For full setup and deployment instructions, see [SETUP.md](SETUP.md).

---

## Project Structure

```
medpulse/
├── public/
│   ├── index.html
│   ├── article.html
│   ├── dashboard.html
│   ├── editorial-policy.html
│   ├── privacy-policy.html
│   ├── terms.html
│   ├── css/styles.css
│   └── js/
│       ├── config.js
│       ├── main.js
│       ├── article.js
│       ├── dashboard-init.js
│       └── modules/
│           ├── api.js
│           ├── auth.js
│           ├── articles.js
│           ├── dashboard.js
│           ├── pubmed.js
│           ├── storage.js
│           └── ui.js
├── sql/
│   ├── 001_create_tables.sql
│   ├── 002_rls_policies.sql
│   ├── 003_seed_data.sql
│   ├── 004_likes_comments_registration.sql
│   └── 005_notifications_search.sql
└── worker/
    ├── auto-import-worker.js
    └── wrangler.toml
```

---

## Roles

| Role   | Read | Write own | Edit all | Manage users | PubMed import |
|--------|------|-----------|----------|--------------|---------------|
| reader | yes  | no        | no       | no           | no            |
| author | yes  | yes       | no       | no           | no            |
| editor | yes  | yes       | yes      | no           | no            |
| admin  | yes  | yes       | yes      | yes          | yes           |

---

## License

MIT
