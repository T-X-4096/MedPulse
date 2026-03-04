/**
 * config.js — Supabase configuration
 *
 * Environment variables are injected by Cloudflare Pages at build time.
 * For local development, create a .env file or replace the values directly.
 *
 * Cloudflare Pages: set these in Settings → Environment Variables
 *   SUPABASE_URL      — https://xxxx.supabase.co
 *   SUPABASE_ANON_KEY — eyJhbGci...
 *
 * NEVER expose your service_role key here.
 */

// In Cloudflare Pages, env vars are injected at BUILD time via a _worker.js
// or via the Pages Functions feature. For static deployments without a Worker,
// you can inject values through a build-time replacement or reference a
// window.__ENV__ global set by a <script> in your HTML.
//
// Pattern: We read from window.__ENV__ first (set by deployment),
// then fall back to constants for local development.

const ENV = (typeof window !== 'undefined' && window.__ENV__) || {};

export const SUPABASE_URL =
  ENV.SUPABASE_URL ||
  'https://onqnuymdzpppaxyhntch.supabase.co'; // Replaced at build time

export const SUPABASE_ANON_KEY =
  ENV.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ucW51eW1kenBwcGF4eWhudGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTA2NDEsImV4cCI6MjA4ODE4NjY0MX0.l4u81vKPPi4UQZsNexiqmfWVeczlFViosqnYhaQqBkQ'; // Replaced at build time

/** Articles pagination page size */
export const PAGE_SIZE = 12;

/** Supabase Storage bucket name */
export const STORAGE_BUCKET = 'article-images';

/** Available article categories */
export const CATEGORIES = [
  { value: 'cardiology',         label: 'Cardiology',         emoji: '❤️' },
  { value: 'oncology',           label: 'Oncology',           emoji: '🔬' },
  { value: 'neurology',          label: 'Neurology',          emoji: '🧠' },
  { value: 'immunology',         label: 'Immunology',         emoji: '🛡️' },
  { value: 'infectious-disease', label: 'Infectious Disease', emoji: '🦠' },
  { value: 'mental-health',      label: 'Mental Health',      emoji: '🧘' },
  { value: 'public-health',      label: 'Public Health',      emoji: '🌍' },
  { value: 'pharmacology',       label: 'Pharmacology',       emoji: '💊' },
  { value: 'surgery',            label: 'Surgery',            emoji: '🏥' },
  { value: 'pediatrics',         label: 'Pediatrics',         emoji: '👶' },
  { value: 'geriatrics',         label: 'Geriatrics',         emoji: '🌿' },
  { value: 'research',           label: 'Research',           emoji: '📊' },
  { value: 'technology',         label: 'Medical Technology', emoji: '⚙️' },
  { value: 'policy',             label: 'Health Policy',      emoji: '📋' },
];

/** Get category label by value */
export function getCategoryLabel(value) {
  return CATEGORIES.find(c => c.value === value) || { label: value, emoji: '📰' };
}

// ── PubMed / NCBI Configuration ──────────────────────────────

/**
 * Optional NCBI API key for higher rate limits (10 req/s vs 3 req/s).
 * Get a free key at: https://www.ncbi.nlm.nih.gov/account/
 * Leave as empty string to use without a key.
 */
export const PUBMED_API_KEY = '148e07bd8919b686e8eee4c675e5fa3c6709';

/**
 * Number of articles to fetch per search term per import run.
 */
export const PUBMED_MAX_RESULTS = 100;

/**
 * Search terms used by the auto-importer.
 * Covers all 14 MedPulse categories. No date restriction — imports all time.
 * PubMed query syntax: https://pubmed.ncbi.nlm.nih.gov/help/
 */
export const PUBMED_SEARCH_TERMS = [
  // ── Broad clinical research
  'clinical trial[pt] AND humans[mh] AND hasabstract',
  'randomized controlled trial[pt] AND humans[mh] AND hasabstract',
  'systematic review[pt] AND humans[mh] AND hasabstract',
  'meta-analysis[pt] AND humans[mh] AND hasabstract',
  // ── Cardiology
  'cardiology[mh] AND hasabstract',
  'heart failure[mh] AND hasabstract',
  'coronary artery disease[mh] AND clinical trial[pt] AND hasabstract',
  // ── Oncology
  'neoplasms[mh] AND clinical trial[pt] AND hasabstract',
  'cancer[ti] AND treatment[ti] AND hasabstract',
  'chemotherapy[ti] AND randomized[ti] AND hasabstract',
  // ── Neurology
  'neurology[mh] AND clinical trial[pt] AND hasabstract',
  'alzheimer disease[mh] AND hasabstract',
  'stroke[mh] AND treatment[ti] AND hasabstract',
  // ── Immunology
  'immunotherapy[mh] AND hasabstract',
  'autoimmune diseases[mh] AND clinical trial[pt] AND hasabstract',
  // ── Infectious Disease
  'communicable diseases[mh] AND clinical trial[pt] AND hasabstract',
  'vaccine[ti] AND efficacy[ti] AND hasabstract',
  'antimicrobial resistance[mh] AND hasabstract',
  // ── Mental Health
  'mental health[mh] AND clinical trial[pt] AND hasabstract',
  'depression[mh] AND treatment[ti] AND hasabstract',
  'anxiety disorders[mh] AND therapy[ti] AND hasabstract',
  // ── Public Health
  'public health[mh] AND hasabstract',
  'epidemiology[mh] AND hasabstract',
  'preventive medicine[mh] AND hasabstract',
  // ── Pharmacology
  'pharmacology[mh] AND clinical trial[pt] AND hasabstract',
  'drug therapy[mh] AND randomized controlled trial[pt] AND hasabstract',
  // ── Surgery
  'surgical procedures, operative[mh] AND clinical trial[pt] AND hasabstract',
  'minimally invasive surgical procedures[mh] AND hasabstract',
  // ── Pediatrics
  'pediatrics[mh] AND clinical trial[pt] AND hasabstract',
  'child health[mh] AND hasabstract',
  // ── Geriatrics
  'geriatrics[mh] AND clinical trial[pt] AND hasabstract',
  'aging[mh] AND clinical trial[pt] AND hasabstract',
  // ── Medical Technology / AI
  'artificial intelligence AND medicine AND hasabstract',
  'machine learning AND clinical[ti] AND hasabstract',
  'telemedicine[mh] AND hasabstract',
  // ── Health Policy
  'health policy[mh] AND hasabstract',
  'healthcare reform[mh] AND hasabstract',
];

export const PUBMED_CRON_SCHEDULE = '0 */6 * * *';
