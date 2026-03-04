# MedPulse PubMed Auto-Import Worker

Cloudflare Worker that runs every 6 hours and imports the latest
PubMed articles into your MedPulse Supabase database.

## Prerequisites

- Node.js installed
- A Cloudflare account
- Your MedPulse Supabase project running

## Setup

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Get your Supabase service_role key

In Supabase Dashboard → **Settings → API** → copy the **service_role** key.
⚠️ This key bypasses RLS — only use it in server-side code like this Worker.

### 3. Create an "importer" user in Supabase

This user is credited as the author of auto-imported articles.

Option A — use your existing admin account UUID:
```sql
SELECT id FROM auth.users WHERE email = 'your@email.com';
```

Option B — create a dedicated importer account:
```sql
-- In Supabase Auth, create user then:
INSERT INTO public.profiles (id, display_name, role)
VALUES ('<new-user-uuid>', 'PubMed Importer', 'author');
```

### 4. Set Worker secrets

```bash
cd worker

wrangler secret put SUPABASE_URL
# paste: https://xxxx.supabase.co

wrangler secret put SUPABASE_SERVICE_KEY
# paste: eyJhbGci... (service_role key)

wrangler secret put IMPORT_AUTHOR_ID
# paste: UUID from step 3

# Optional: NCBI API key for higher rate limits (10 req/s vs 3)
wrangler secret put PUBMED_API_KEY
# paste: your NCBI API key (get free at https://www.ncbi.nlm.nih.gov/account/)

# Optional: protect the /run HTTP endpoint
wrangler secret put IMPORT_SECRET
# paste: any random string, e.g. openssl rand -hex 16
```

### 5. Deploy

```bash
wrangler deploy
```

You'll get a URL like `https://medpulse-pubmed-importer.yourname.workers.dev`

### 6. Test it manually

```bash
# Trigger a manual import run (replace with your worker URL and secret)
curl https://medpulse-pubmed-importer.yourname.workers.dev/run?secret=YOUR_IMPORT_SECRET
```

Response:
```json
{
  "success": true,
  "imported": 12,
  "skipped": 3,
  "errors": []
}
```

## Cron Schedule

The worker runs on `0 */6 * * *` — every 6 hours at 00:00, 06:00, 12:00, 18:00 UTC.

To change the schedule, edit `wrangler.toml`:
```toml
[triggers]
crons = ["0 */12 * * *"]   # every 12 hours
# or
crons = ["0 8 * * *"]      # once daily at 8am UTC
```

## Customising Search Terms

Edit the `SEARCH_TERMS` array in `auto-import-worker.js`:

```javascript
const SEARCH_TERMS = [
  'clinical trial[pt] AND humans[mh] AND ("last 7 days"[dp])',
  'your custom query here',
];
```

PubMed query syntax reference: https://pubmed.ncbi.nlm.nih.gov/help/

## Viewing Logs

```bash
wrangler tail
```

## Monitoring

In the Cloudflare Dashboard → Workers & Pages → your worker → **Metrics**
you can see invocation counts, errors, and execution times.
