/**
 * auto-import-worker.js — Cloudflare Worker
 *
 * Runs on a cron schedule (every 6 hours by default).
 * Fetches recent PubMed articles and inserts them into Supabase
 * using the service_role key (bypasses RLS — safe server-side only).
 *
 * Environment variables required (set in Cloudflare Workers dashboard):
 *   SUPABASE_URL          — https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  — your service_role key (NEVER in frontend)
 *   PUBMED_API_KEY        — optional, for higher rate limits
 *   IMPORT_AUTHOR_ID      — UUID of the "importer" user in your profiles table
 *
 * Deploy:
 *   1. Install Wrangler: npm install -g wrangler
 *   2. cd worker && wrangler deploy
 */

// ── Configuration ─────────────────────────────────────────────
const PUBMED_BASE  = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const MAX_PER_TERM = 10;

const SEARCH_TERMS = [
  'clinical trial[pt] AND humans[mh] AND ("last 7 days"[dp])',
  'randomized controlled trial[pt] AND ("last 7 days"[dp])',
  'systematic review[pt] AND ("last 7 days"[dp])',
  'public health AND ("last 7 days"[dp])',
  'cancer treatment AND clinical trial AND ("last 7 days"[dp])',
];

// ── Category inference ─────────────────────────────────────────
const CATEGORY_MAP = [
  { keywords: ['cardiol','heart','cardiac','coronary','cardiovascular'],             category: 'cardiology'         },
  { keywords: ['oncol','cancer','tumor','tumour','carcinoma','lymphoma','leukemia'], category: 'oncology'           },
  { keywords: ['neurol','brain','alzheimer','parkinson','stroke','dementia'],        category: 'neurology'          },
  { keywords: ['immun','autoimmun','vaccine','vaccination','antibod'],               category: 'immunology'         },
  { keywords: ['infect','virus','viral','bacterial','pathogen','antimicrob','covid'],category: 'infectious-disease' },
  { keywords: ['psychiatr','mental','depression','anxiety','schizophrenia'],         category: 'mental-health'      },
  { keywords: ['public health','epidemiol','population','surveillance'],             category: 'public-health'      },
  { keywords: ['pharma','drug','clinical trial','randomized','placebo'],             category: 'pharmacology'       },
  { keywords: ['surg','surgical','operative','laparoscop','transplant'],             category: 'surgery'            },
  { keywords: ['pediatr','child','neonatal','infant','adolescent'],                  category: 'pediatrics'         },
  { keywords: ['geriatr','elderly','aging','aged','older adult'],                    category: 'geriatrics'         },
  { keywords: ['artificial intelligence','machine learning','digital health'],        category: 'technology'         },
];

function guessCategory(text = '') {
  const lower = text.toLowerCase();
  for (const { keywords, category } of CATEGORY_MAP) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'research';
}

// ── PubMed helpers ─────────────────────────────────────────────

async function searchPMIDs(query, apiKey) {
  const keyParam = apiKey ? `&api_key=${apiKey}` : '';
  const url = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${MAX_PER_TERM}&retmode=json&sort=pub+date${keyParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`esearch HTTP ${res.status}`);
  const json = await res.json();
  return json?.esearchresult?.idlist || [];
}

async function fetchSummaries(pmids, apiKey) {
  if (!pmids.length) return [];
  const keyParam = apiKey ? `&api_key=${apiKey}` : '';
  const url = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json${keyParam}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`esummary HTTP ${res.status}`);
  const json = await res.json();
  return pmids.map(id => json?.result?.[id]).filter(Boolean);
}

async function fetchAbstractXml(pmid, apiKey) {
  const keyParam = apiKey ? `&api_key=${apiKey}` : '';
  const url = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=xml${keyParam}`;
  const res = await fetch(url);
  if (!res.ok) return '';
  const text = await res.text();

  // Parse abstract sections from XML
  const abstracts = [];
  const regex = /<AbstractText(?:\s+Label="([^"]*)")?[^>]*>([\s\S]*?)<\/AbstractText>/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const label   = m[1];
    const content = m[2].replace(/<[^>]+>/g, '').trim();
    abstracts.push(label ? `<h3>${label}</h3>\n<p>${content}</p>` : `<p>${content}</p>`);
  }
  return abstracts.join('\n');
}

function parsePubDate(dateStr = '') {
  const cleaned = dateStr.replace(/\s+/g, ' ').trim();
  let d = new Date(cleaned.replace(/\//g, '-'));
  if (!isNaN(d)) return d.toISOString();
  d = new Date(cleaned);
  if (!isNaN(d)) return d.toISOString();
  return new Date().toISOString();
}

function buildArticle(summary, abstract, authorId) {
  const pmid    = summary.uid;
  const title   = (summary.title || `PubMed ${pmid}`).replace(/\.$/, '');
  const journal = summary.fulljournalname || summary.source || '';
  const authors = (summary.authors || []).slice(0, 3).map(a => a.name).join(', ');
  const pubDate = parsePubDate(summary.sortpubdate || summary.pubdate);
  const slug    = `pubmed-${pmid}`;
  const category = guessCategory(`${title} ${journal}`);

  const rawTags = [
    ...(summary.keywords || []),
    ...(summary.pubtype  || []).map(t => t.toLowerCase().replace(/\s+/g, '-')),
    'pubmed',
  ];
  const tags = [...new Set(
    rawTags
      .map(t => String(t).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').trim())
      .filter(t => t.length > 1 && t.length < 40)
      .slice(0, 8)
  )];

  const plainAbstract = abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const summaryText   = plainAbstract.length > 400
    ? plainAbstract.slice(0, 397) + '…'
    : plainAbstract || `Research article from ${journal}.`;

  const byline = authors ? `<p><em>Authors: ${authors}</em></p>` : '';
  const source  = `<p><em>Source: ${journal}${summary.volume ? `, Vol. ${summary.volume}` : ''}${summary.pages ? `, pp. ${summary.pages}` : ''}</em></p>`;
  const doiLink = summary.elocationid
    ? `<p><a href="https://doi.org/${summary.elocationid.replace('doi: ', '')}" target="_blank" rel="noopener">View full article →</a></p>`
    : `<p><a href="https://pubmed.ncbi.nlm.nih.gov/${pmid}/" target="_blank" rel="noopener">View on PubMed →</a></p>`;

  const body = [abstract || `<p>${summaryText}</p>`, '<hr />', byline, source, doiLink].join('\n');

  return { title, slug, summary: summaryText, body, category, tags, hero_image: null, status: 'published', author_id: authorId, published_at: pubDate };
}

// ── Supabase helpers (REST API, no SDK needed) ─────────────────

async function slugExists(slug, supabaseUrl, serviceKey) {
  const url = `${supabaseUrl}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&select=id`;
  const res = await fetch(url, {
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) return false;
  const data = await res.json();
  return Array.isArray(data) && data.length > 0;
}

async function insertArticle(article, supabaseUrl, serviceKey) {
  const url = `${supabaseUrl}/rest/v1/articles`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'apikey':        serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(article),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert failed (${res.status}): ${text}`);
  }
  return true;
}

// ── Main import loop ───────────────────────────────────────────

async function runImport(env) {
  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PUBMED_API_KEY, IMPORT_AUTHOR_ID } = env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !IMPORT_AUTHOR_ID) {
    throw new Error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, IMPORT_AUTHOR_ID');
  }

  const delay = ms => new Promise(r => setTimeout(r, ms));
  const pause = PUBMED_API_KEY ? 120 : 350; // ms between requests

  let totalImported = 0;
  let totalSkipped  = 0;
  const errors      = [];

  for (const term of SEARCH_TERMS) {
    try {
      const pmids     = await searchPMIDs(term, PUBMED_API_KEY);
      await delay(pause);
      const summaries = await fetchSummaries(pmids, PUBMED_API_KEY);
      await delay(pause);

      for (const summary of summaries) {
        const slug = `pubmed-${summary.uid}`;

        try {
          const exists = await slugExists(slug, SUPABASE_URL, SUPABASE_SERVICE_KEY);
          if (exists) { totalSkipped++; continue; }

          await delay(pause);
          const abstract = await fetchAbstractXml(summary.uid, PUBMED_API_KEY);
          await delay(pause);

          const article = buildArticle(summary, abstract, IMPORT_AUTHOR_ID);
          await insertArticle(article, SUPABASE_URL, SUPABASE_SERVICE_KEY);
          totalImported++;
        } catch (err) {
          errors.push(`PMID ${summary.uid}: ${err.message}`);
        }
      }
    } catch (err) {
      errors.push(`Term "${term.slice(0, 40)}…": ${err.message}`);
    }
  }

  return { imported: totalImported, skipped: totalSkipped, errors };
}

// ── Worker export ──────────────────────────────────────────────

export default {
  // Cron trigger handler
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      console.log('[MedPulse] Auto-import started:', new Date().toISOString());
      try {
        const result = await runImport(env);
        console.log('[MedPulse] Auto-import complete:', JSON.stringify(result));
      } catch (err) {
        console.error('[MedPulse] Auto-import failed:', err.message);
      }
    })());
  },

  // HTTP trigger — allows manual run via curl or browser
  // GET https://your-worker.workers.dev/run
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== '/run') {
      return new Response(JSON.stringify({
        status: 'MedPulse PubMed Import Worker',
        endpoints: { 'GET /run': 'Trigger manual import' },
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Simple auth check — pass ?secret=xxx or Authorization header
    const secret = url.searchParams.get('secret') || request.headers.get('x-import-secret');
    if (env.IMPORT_SECRET && secret !== env.IMPORT_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    ctx.waitUntil((async () => {
      console.log('[MedPulse] Manual import triggered via HTTP');
    })());

    try {
      const result = await runImport(env);
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
