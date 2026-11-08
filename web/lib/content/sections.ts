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

/** Same JSON "shape" (string/number/boolean/null/array/object) — guards against bad edits. */
function sameKind(a: unknown, b: unknown): boolean {
  const kind = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  const ka = kind(a);
  const kb = kind(b);
  // nullable fields (videoUrl, pdfUrl) may switch between null and string
  if ((ka === 'null' && kb === 'string') || (ka === 'string' && kb === 'null')) return true;
  return ka === kb;
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
    if (sameKind(v, sec[r.key])) sec[r.key] = v;
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
