/**
 * pubmed.js — NCBI PubMed E-utilities API client
 *
 * No API key required (3 req/sec limit).
 * Get a free NCBI key at ncbi.nlm.nih.gov/account for 10 req/sec.
 */

import { PUBMED_API_KEY, PUBMED_MAX_RESULTS, PUBMED_SEARCH_TERMS } from '../config.js';
import { createArticle, isSlugTaken } from './api.js';

const BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const apiParam = () => PUBMED_API_KEY ? `&api_key=${PUBMED_API_KEY}` : '';

// Category-specific search presets shown in the Import panel UI
export const PUBMED_SEARCHES = [
  { category: 'cardiology',         label: 'Cardiology',         emoji: '❤️',  query: 'cardiology[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract' },
  { category: 'oncology',           label: 'Oncology',           emoji: '🔬',  query: 'neoplasms[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract' },
  { category: 'neurology',          label: 'Neurology',          emoji: '🧠',  query: 'neurology[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract' },
  { category: 'immunology',         label: 'Immunology',         emoji: '🛡️', query: 'immunology[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract' },
  { category: 'infectious-disease', label: 'Infectious Disease', emoji: '🦠',  query: 'communicable diseases[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract' },
  { category: 'mental-health',      label: 'Mental Health',      emoji: '🧘',  query: 'mental health[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract' },
  { category: 'public-health',      label: 'Public Health',      emoji: '🌍',  query: 'public health[MeSH Terms] AND ("last 30 days"[PDat]) AND hasabstract' },
  { category: 'pharmacology',       label: 'Pharmacology',       emoji: '💊',  query: 'pharmacology[MeSH Terms] AND clinical trial[PT] AND ("last 30 days"[PDat]) AND hasabstract' },
  { category: 'research',           label: 'Latest Research',    emoji: '📊',  query: 'medicine[MeSH Terms] AND ("last 14 days"[PDat]) AND hasabstract AND systematic review[PT]' },
];

// Core E-utilities

export async function searchPMIDs(query, maxResults = PUBMED_MAX_RESULTS) {
  const url = `${BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=pub+date${apiParam()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PubMed search failed: ${res.status}`);
  const data = await res.json();
  return data?.esearchresult?.idlist || [];
}

export async function fetchSummaries(pmids) {
  if (!pmids.length) return [];
  const url = `${BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json${apiParam()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PubMed summary failed: ${res.status}`);
  const data = await res.json();
  return pmids.map(id => data?.result?.[id]).filter(Boolean);
}

export async function fetchAbstracts(pmids) {
  if (!pmids.length) return {};
  const url = `${BASE}/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&rettype=xml&retmode=xml${apiParam()}`;
  const res = await fetch(url);
  if (!res.ok) return {};
  return parseAbstractsFromXML(await res.text());
}

function parseAbstractsFromXML(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const result = {};
  doc.querySelectorAll('PubmedArticle').forEach(article => {
    const pmid = article.querySelector('PMID')?.textContent?.trim();
    if (!pmid) return;
    const els = article.querySelectorAll('AbstractText');
    if (!els.length) { result[pmid] = ''; return; }
    let html = '';
    if (els[0].hasAttribute('Label')) {
      els.forEach(el => {
        const label = el.getAttribute('Label');
        const text  = el.textContent?.trim();
        if (text) html += `<h3>${label}</h3><p>${esc(text)}</p>\n`;
      });
    } else {
      html = `<p>${esc(Array.from(els).map(e => e.textContent?.trim()).join('\n\n')).replace(/\n\n/g, '</p><p>')}</p>`;
    }
    result[pmid] = html;
  });
  return result;
}

export function mapToArticle(summary, abstract, category) {
  const pmid    = summary.uid || '';
  const title   = summary.title?.replace(/\.$/, '') || '';
  const journal = summary.source || summary.fulljournalname || '';
  const authors = fmtAuthors(summary.authors || []);
  const pubDate = parseDate(summary.pubdate || summary.epubdate || '');
  const plain   = stripHtml(abstract);
  const summaryText = firstSentences(plain, 2) || `Research article published in ${journal}.`;

  return {
    title,
    slug:         `pubmed-${pmid}`,
    summary:      summaryText.slice(0, 480),
    body:         buildBody({ journal, authors, pubDate, abstract, pmid }),
    category,
    tags:         buildTags(summary, category),
    hero_image:   null,
    status:       'published',
    published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
  };
}

function buildBody({ journal, authors, pubDate, abstract, pmid }) {
  const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
  return `<div style="background:#f0f7ff;border-left:4px solid #00B4D8;padding:14px 18px;border-radius:4px;margin-bottom:28px;font-size:0.9rem;"><strong>Source:</strong> ${esc(journal)}${authors ? ` &nbsp;·&nbsp; <strong>Authors:</strong> ${esc(authors)}` : ''}${pubDate ? ` &nbsp;·&nbsp; <strong>Published:</strong> ${esc(pubDate)}` : ''} &nbsp;·&nbsp; <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0096B7;">View on PubMed ↗</a></div>\n${abstract || '<p><em>Abstract not available.</em></p>'}\n<hr style="margin:32px 0;border:none;border-top:1px solid #EEF2F7;" />\n<p style="font-size:0.8rem;color:#8FA3BF;">Imported from PubMed (PMID: <a href="${url}" target="_blank" rel="noopener noreferrer">${esc(pmid)}</a>).</p>`;
}

// High-level functions called by dashboard.js

export async function previewPubMedSearch(query, maxResults = PUBMED_MAX_RESULTS) {
  try {
    const pmids = await searchPMIDs(query, maxResults);
    if (!pmids.length) return { previews: [], error: null };

    const summaries = await fetchSummaries(pmids);
    const previews  = summaries.map(s => ({
      pmid:     s.uid,
      title:    s.title?.replace(/\.$/, '') || `PMID ${s.uid}`,
      journal:  s.fulljournalname || s.source || '',
      authors:  fmtAuthors((s.authors || []).slice(0, 2)),
      pubdate:  s.pubdate || '',
      category: guessCategory(`${s.title} ${s.fulljournalname || s.source}`),
      pubtype:  (s.pubtype || []).join(', '),
      _summary: s,
    }));

    return { previews, error: null };
  } catch (err) {
    return { previews: [], error: err.message };
  }
}

export async function importPubMedArticles(summaries, authorId, onProgress) {
  let imported = 0;
  let skipped  = 0;
  const errors = [];
  const delay  = ms => new Promise(r => setTimeout(r, ms));
  const pause  = PUBMED_API_KEY ? 120 : 350;

  // Batch-fetch all abstracts at once (faster than one-by-one)
  const pmids = summaries.map(s => s.uid);
  let abstracts = {};
  try { abstracts = await fetchAbstracts(pmids); } catch { /* continue */ }

  for (let i = 0; i < summaries.length; i++) {
    const s    = summaries[i];
    const pmid = s.uid;
    const slug = `pubmed-${pmid}`;

    onProgress?.(i, summaries.length);

    try {
      const taken = await isSlugTaken(slug);
      if (taken) { skipped++; continue; }

      const category = guessCategory(`${s.title} ${s.fulljournalname || s.source}`);
      const article  = mapToArticle(s, abstracts[pmid] || '', category);
      article.author_id = authorId;

      const { error } = await createArticle(article);
      if (error) errors.push(`PMID ${pmid}: ${error.message}`);
      else imported++;
    } catch (err) {
      errors.push(`PMID ${pmid}: ${err.message}`);
    }

    await delay(pause);
  }

  onProgress?.(summaries.length, summaries.length);
  return { imported, skipped, errors };
}

export async function runAutoImport(authorId, onProgress) {
  let totalImported = 0;
  let totalSkipped  = 0;
  const allErrors   = [];

  for (const term of PUBMED_SEARCH_TERMS) {
    try {
      const pmids     = await searchPMIDs(term, PUBMED_MAX_RESULTS);
      const summaries = await fetchSummaries(pmids);
      const result    = await importPubMedArticles(summaries, authorId, onProgress);
      totalImported  += result.imported;
      totalSkipped   += result.skipped;
      allErrors.push(...result.errors);
    } catch (err) {
      allErrors.push(`Term "${term.slice(0, 50)}": ${err.message}`);
    }
  }

  return { imported: totalImported, skipped: totalSkipped, errors: allErrors };
}

// Helpers

const CATEGORY_MAP = [
  { keywords: ['cardiol','heart','cardiac','coronary','cardiovascular'],              category: 'cardiology'         },
  { keywords: ['oncol','cancer','tumor','tumour','carcinoma','lymphoma','leukemia'],  category: 'oncology'           },
  { keywords: ['neurol','brain','alzheimer','parkinson','stroke','dementia'],         category: 'neurology'          },
  { keywords: ['immun','autoimmun','vaccine','vaccination','antibod'],                category: 'immunology'         },
  { keywords: ['infect','virus','viral','bacterial','pathogen','antimicrob','covid'], category: 'infectious-disease' },
  { keywords: ['psychiatr','mental','depression','anxiety','schizophrenia'],          category: 'mental-health'      },
  { keywords: ['public health','epidemiol','population','surveillance'],              category: 'public-health'      },
  { keywords: ['pharma','drug','clinical trial','randomized','placebo'],              category: 'pharmacology'       },
  { keywords: ['surg','surgical','operative','laparoscop','transplant'],              category: 'surgery'            },
  { keywords: ['pediatr','child','neonatal','infant','adolescent'],                   category: 'pediatrics'         },
  { keywords: ['geriatr','elderly','aging','aged','older adult'],                     category: 'geriatrics'         },
  { keywords: ['artificial intelligence','machine learning','digital health'],         category: 'technology'         },
];

function guessCategory(text = '') {
  const lower = text.toLowerCase();
  for (const { keywords, category } of CATEGORY_MAP) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'research';
}

function fmtAuthors(authors) {
  if (!authors.length) return '';
  const names = authors.slice(0, 3).map(a => a.name || '').filter(Boolean);
  return authors.length > 3 ? `${names.join(', ')} et al.` : names.join(', ');
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function buildTags(summary, category) {
  const tags = [category];
  if (summary.source) tags.push(summary.source.toLowerCase().replace(/\s+/g, '-').slice(0, 30));
  (summary.pubtype || []).forEach(pt => {
    const t = pt.toLowerCase().replace(/\s+/g, '-');
    if (!tags.includes(t)) tags.push(t);
  });
  return [...new Set(tags)].slice(0, 6);
}

function firstSentences(text, n = 2) {
  if (!text) return '';
  return (text.match(/[^.!?]+[.!?]+/g) || []).slice(0, n).join(' ').trim();
}

function stripHtml(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function esc(s = '') {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
