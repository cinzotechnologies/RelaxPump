// Website content as rows of the D1 `content` table: one row per (section, field), JSON value.
// The design copy in DEFAULT_* is the seed and the fallback for any missing or broken row.
import { type Contact, DEFAULT_CONTACT } from './contact';
import { DEFAULT_HOME, type HomeContent } from './home';

export type SiteContent = HomeContent & { contact: Contact };
export type SectionId = keyof SiteContent;

export const DEFAULT_SITE: SiteContent = { ...DEFAULT_HOME, contact: DEFAULT_CONTACT };

/** Admin order and labels (Admin.dc.html: Hero, How it works, App screens, …, Contact info). */
export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'hero', label: 'Hero' },
  { id: 'how', label: 'How it works' },
  { id: 'gallery', label: 'App screens' },
  { id: 'guide', label: 'Install video' },
  { id: 'manual', label: 'Manual' },
  { id: 'download', label: 'App download' },
  { id: 'store', label: 'Store' },
  { id: 'contact', label: 'Contact info' },
];

export type ContentRow = { section: string; key: string; value: string | null };

const kind = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

/**
 * Fit a stored value to the default's shape, all the way down — guards against bad edits.
 * Wrong types fall back to the default; missing object keys get the default (so new fields work
 * with old rows); array items are checked against the default item at the same index (or the
 * first). Nullable fields (videoUrl, pdfUrl, imageUrl) may switch between null and string.
 */
export function conform(v: unknown, d: unknown): unknown {
  const kv = kind(v);
  const kd = kind(d);
  if ((kv === 'null' && kd === 'string') || (kv === 'string' && kd === 'null')) return v;
  if (kv !== kd) return structuredClone(d);
  if (kd === 'array') {
    const da = d as unknown[];
    return (v as unknown[]).map((x, i) => (da.length ? conform(x, da[i] ?? da[0]) : x));
  }
  if (kd === 'object') {
    const vo = v as Record<string, unknown>;
    const dobj = d as Record<string, unknown>;
    // another variant of a union (manual pages, by `kind`) is kept as stored
    if ('kind' in dobj && vo.kind !== dobj.kind) return v;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(dobj)) out[k] = k in vo ? conform(vo[k], dobj[k]) : structuredClone(dobj[k]);
    for (const k of Object.keys(vo)) if (!(k in dobj)) out[k] = vo[k]; // optional keys (line colour)
    return out;
  }
  return v;
}

/** Merge stored rows over the defaults. Unknown sections/keys and wrong types are ignored. */
export function mergeContent(rows: ContentRow[], base: SiteContent = DEFAULT_SITE): SiteContent {
  const out = structuredClone(base) as Record<string, Record<string, unknown>>;
  for (const r of rows) {
    const sec = out[r.section];
    if (!sec || !(r.key in sec) || r.value == null) continue;
    let v: unknown;
    try {
      v = JSON.parse(r.value);
    } catch {
      continue;
    }
    sec[r.key] = conform(v, sec[r.key]);
  }
  return out as unknown as SiteContent;
}

/** All (section, key, JSON) rows of a content object — used for the seed and for publish. */
export function toRows(c: SiteContent = DEFAULT_SITE): { section: SectionId; key: string; json: string }[] {
  return SECTIONS.flatMap(({ id }) =>
    Object.entries(c[id] as Record<string, unknown>).map(([key, v]) => ({
      section: id,
      key,
      json: JSON.stringify(v),
    })),
  );
}
