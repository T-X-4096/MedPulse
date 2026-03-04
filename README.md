# ⚕️ MedPulse — Medical News Platform

A fast, modular medical news website built with pure HTML, CSS, and vanilla JavaScript ES Modules, powered by Supabase and deployed on Cloudflare Pages.

## Stack

| Layer       | Technology                         |
|-------------|------------------------------------|
| Frontend    | HTML5, CSS3, Vanilla JS (ES Modules) |
| Database    | Supabase (PostgreSQL)              |
| Auth        | Supabase Auth (email/password)     |
| Storage     | Supabase Storage                   |
| Hosting     | Cloudflare Pages                   |
| CDN         | Cloudflare global edge network     |

## Features

- 📰 Published article listing with category + tag filters
- 🔍 Featured article hero, responsive grid
- 🔐 Email/password auth with role-based permissions
- ✏️ Author dashboard: create, edit, delete articles
- 🖼️ Drag-and-drop hero image upload to Supabase Storage
- 📱 Fully responsive, mobile-first design
- ⚡ Zero build step — serve the `public/` folder directly
- 🔒 Row Level Security on all database tables

## Quick Start

1. Clone this repo
2. Create a Supabase project at https://supabase.com
3. Run the SQL files in `sql/` (in order)
4. Set your Supabase URL and anon key in `public/js/config.js`
5. Serve the `public/` folder locally:
   ```bash
   cd public && python3 -m http.server 8080
   ```
6. Deploy to Cloudflare Pages (set build output to `public/`)

## Full Documentation

See [`docs/SETUP.md`](docs/SETUP.md) for complete setup and deployment instructions.

## Project Structure

```
public/
├── index.html        Homepage
├── article.html      Single article
├── dashboard.html    Author dashboard
├── css/styles.css    Styles
└── js/
    ├── config.js     Supabase config
    ├── main.js       Homepage entry
    ├── article.js    Article entry
    ├── dashboard-init.js  Dashboard entry
    └── modules/
        ├── api.js        DB queries
        ├── auth.js       Authentication
        ├── articles.js   Rendering
        ├── dashboard.js  CRUD logic
        ├── storage.js    Image uploads
        └── ui.js         Shared utilities
sql/
├── 001_create_tables.sql  Schema
├── 002_rls_policies.sql   Security
└── 003_seed_data.sql      Test data
```

## License

MIT
