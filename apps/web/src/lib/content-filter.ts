import { ANYWHERE, NATIVE_SCRIPT, PHRASES, WHOLE_WORD, type TermCategory } from './content-filter-terms';

/**
 * The objectionable-content filter (Apple 1.2 / Google UGC): a server-side gate
 * on the text people publish about themselves and their work, applied to
 * profile names and bios, campaigns, collaboration requests, and project
 * proposals and change requests. Chat is NOT filtered here (Stream moderates
 * that); the term list and its rules live in content-filter-terms.ts.
 *
 * Design rules:
 *  - It refuses, it does not silently rewrite. The person is told which field
 *    and can change it; nothing they typed is quietly altered.
 *  - Whole-word matching for anything short or common, so real words and names
 *    ("assassin", "class", "Scunthorpe", "Essex", "Pakki Sadak") are never blocked.
 *  - It normalises the usual evasions (case, accents, "f.u.c.k", "f*ck",
 *    "sh1t"-style swaps, "fuuuuck") before matching, WITHOUT collapsing the
 *    ordinary double letters real words have.
 *  - It never logs the text, only which field tripped.
 */

export type ContentProblem = {
  status: 422;
  reason: 'objectionable_content';
  /** The request field that tripped, as the client named it (e.g. "bio"). */
  field: string;
  category: TermCategory;
  error: string;
};

// ── normalisation ───────────────────────────────────────────────────────────

const LEET: Record<string, string> = { '4': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '$': 's', '5': 's', '7': 't', '+': 't', '€': 'e' };

/**
 * Lower-case, strip accents and zero-width characters, and undo look-alike swaps.
 * A swap is only undone BETWEEN letters ("f@ck", "sh1t"), never at the edge of a
 * word: "fuck!" must stay "fuck!", not become "fucki", and "₹5000" is left alone.
 */
function fold(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ​-‏⁠﻿]/g, '')
    .toLowerCase()
    // "f@ck", "f#ck", "f%ck": a symbol standing in for ANY letter is a wildcard.
    .replace(/(?<=[a-z])[@#%^]+(?=[a-z])/g, (run) => '*'.repeat(run.length))
    .replace(/(?<=[a-z])[4013!$57+€]+(?=[a-z])/g, (run) => [...run].map((c) => LEET[c] ?? c).join(''))
    .replace(/fvck/g, 'fuck');
}

/** Collapse runs of THREE or more of the same letter down to `keep` ("fuuuuck" → "fuck"); doubles are untouched. */
function collapse(s: string, keep: 1 | 2): string {
  return s.replace(/([a-z])\1{2,}/g, keep === 1 ? '$1' : '$1$1');
}

/** The spellings of one word worth testing: as typed, runs capped at 2, runs capped at 1. */
function forms(w: string): string[] {
  const a = collapse(w, 2);
  const b = collapse(w, 1);
  return a === w && b === w ? [w] : [...new Set([w, a, b])];
}

/**
 * Split into words on anything that is not a letter (or `*`, kept as a wildcard),
 * joining spaced-out single letters ("f u c k", "f.u.c.k" → "fuck").
 */
function words(folded: string): string[] {
  const raw = folded.split(/[^a-z*]+/).filter(Boolean);
  const out: string[] = [];
  let run = '';
  for (const w of raw) {
    if (w.length === 1 && w !== '*') {
      run += w;
      continue;
    }
    if (run.length >= 3) out.push(run);
    run = '';
    out.push(w);
  }
  if (run.length >= 3) out.push(run);
  return out;
}

// ── compiled term tables ────────────────────────────────────────────────────

type Compiled = {
  whole: Map<string, TermCategory>;
  anywhere: Array<[string, TermCategory]>;
  phrases: Array<[string[], TermCategory]>;
};

let cache: Compiled | null = null;
let cacheKey = '';

function extraTerms(): string[] {
  return (process.env.CONTENT_FILTER_EXTRA_TERMS ?? '')
    .split(',')
    .map((t) => fold(t.trim()).replace(/[^a-z]/g, ''))
    .filter((t) => t.length >= 3);
}

function compile(): Compiled {
  const extra = extraTerms();
  const key = extra.join('|');
  if (cache && key === cacheKey) return cache;

  const whole = new Map<string, TermCategory>();
  const anywhere: Array<[string, TermCategory]> = [];
  const phrases: Array<[string[], TermCategory]> = [];
  for (const cat of Object.keys(WHOLE_WORD) as TermCategory[]) {
    for (const t of WHOLE_WORD[cat]) whole.set(t, cat);
    for (const t of ANYWHERE[cat]) anywhere.push([t, cat]);
    for (const p of PHRASES[cat]) phrases.push([p.split(' '), cat]);
  }
  for (const t of extra) whole.set(t, 'abuse');
  cache = { whole, anywhere, phrases };
  cacheKey = key;
  return cache;
}

/** Does `token` (which contains `*`) match any whole term of the same length, `*` standing for any one letter? */
function wildcardCategory(token: string, table: Map<string, TermCategory>): TermCategory | null {
  if (token.replace(/\*/g, '').length < 2) return null; // "***" is not a word
  for (const [term, cat] of table) {
    if (term.length !== token.length) continue;
    let ok = true;
    for (let i = 0; i < term.length && ok; i++) ok = token[i] === '*' || token[i] === term[i];
    if (ok) return cat;
  }
  return null;
}

// ── public API ──────────────────────────────────────────────────────────────

/** The category of the first objectionable term in `text`, or null. Never returns the term itself. */
export function objectionableCategory(text: string): TermCategory | null {
  if (!text || typeof text !== 'string') return null;

  for (const native of NATIVE_SCRIPT) if (text.normalize('NFC').includes(native)) return 'abuse';

  const t = compile();
  const ws = words(fold(text));

  for (const w of ws) {
    if (w.includes('*')) {
      const cat = wildcardCategory(w, t.whole);
      if (cat) return cat;
      continue;
    }
    for (const f of forms(w)) {
      const cat = t.whole.get(f);
      if (cat) return cat;
      if (f.length >= 6) for (const [term, c] of t.anywhere) if (f.includes(term)) return c;
    }
  }

  for (const [phrase, cat] of t.phrases) {
    outer: for (let i = 0; i + phrase.length <= ws.length; i++) {
      for (let j = 0; j < phrase.length; j++) if (!forms(ws[i + j]).includes(phrase[j])) continue outer;
      return cat;
    }
  }
  return null;
}

/** How each request field reads in the message shown to the person. */
const LABELS: Record<string, string> = {
  name: 'name',
  bio: 'bio',
  company_name: 'company name',
  companyName: 'company name',
  company_description: 'company description',
  contact_name: 'contact name',
  location: 'location',
  city: 'city',
  title: 'title',
  project_title: 'project title',
  description: 'description',
  project_description: 'project description',
  deliverables: 'deliverables',
  message: 'message',
  note: 'note',
  barter_details: 'barter details',
  details: 'details',
};

/**
 * Check the named fields of a request body. Returns the first that trips, as a
 * ready-to-send 422 body, or null when everything is fine. Non-string and empty
 * values are ignored, so callers can pass a whole payload plus the field names
 * that hold free text.
 */
export function checkContent(payload: Record<string, unknown>, fields: string[]): ContentProblem | null {
  for (const field of fields) {
    const value = payload?.[field];
    if (typeof value !== 'string' || !value) continue;
    const category = objectionableCategory(value);
    if (category) {
      const label = LABELS[field] ?? field;
      return {
        status: 422,
        reason: 'objectionable_content',
        field,
        category,
        error: `Your ${label} contains language that isn't allowed on Influnet. Please rewrite it and try again.`,
      };
    }
  }
  return null;
}

/** The JSON body to send with a ContentProblem. Never includes the offending text. */
export function contentProblemBody(p: ContentProblem): { error: string; reason: string; field: string } {
  return { error: p.error, reason: p.reason, field: p.field };
}
