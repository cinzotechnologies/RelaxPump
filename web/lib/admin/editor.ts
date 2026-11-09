// Website editor: which fields each section shows (Admin.dc.html SECS), mapped onto the
// SiteContent paths they edit, plus the checks every saved value goes through. Pure — used by
// the client editor, the API and the tests.
import { DEFAULT_PRODUCTS } from '@/lib/content/products';
import { conform, DEFAULT_SITE, type SectionId, type SiteContent } from '@/lib/content/sections';
import { youtubeId } from '@/lib/content/youtube';

export { youtubeId };

export type FieldType = 'text' | 'area' | 'link' | 'toggle' | 'image' | 'video' | 'file';
/** path is relative to the section, e.g. "feats.0.t". */
export type Field = { path: string; label: string; type: FieldType; wide?: boolean; max?: number };
export type Group = { title: string; fields: Field[] };
export type EditorSection = { id: SectionId; label: string; icon: string; groups: Group[] };

const t = (path: string, label: string, wide = false): Field => ({ path, label, type: 'text', wide });
const head = (title = 'Heading'): Group => ({
  title,
  fields: [t('kicker', 'Small label'), t('title', 'Title')],
});

export const EDITOR: EditorSection[] = [
  {
    id: 'hero',
    label: 'Hero',
    icon: 'hero',
    groups: [
      {
        title: 'Text',
        fields: [
          t('titleA', 'Heading (line 1)'),
          t('titleB', 'Heading (line 2, teal)'),
          { path: 'sub', label: 'Sub text', type: 'area', max: 300 },
          t('checks.0', 'Tick 1'),
          t('checks.1', 'Tick 2'),
          t('checks.2', 'Tick 3', true),
        ],
      },
      {
        title: 'Background',
        fields: [{ path: 'imageUrl', label: 'Background image (16:9)', type: 'image' }],
      },
      { title: 'Buttons', fields: [t('ctaApp', 'Button 1 text'), t('ctaKit', 'Button 2 text')] },
    ],
  },
  {
    id: 'how',
    label: 'How it works',
    icon: 'how',
    groups: [
      head(),
      ...[0, 1, 2, 3].map((i) => ({
        title: `Slide ${i + 1}`,
        fields: [t(`feats.${i}.t`, 'Title'), t(`feats.${i}.d`, 'Short line')],
      })),
    ],
  },
  {
    id: 'gallery',
    label: 'App screens',
    icon: 'phone',
    groups: [
      head(),
      ...DEFAULT_SITE.gallery.shots.map((s, i) => ({
        title: s.label,
        fields: [
          t(`shots.${i}.label`, 'Name'),
          t(`shots.${i}.d`, 'Short line'),
          {
            path: `shots.${i}.imageUrl`,
            label: 'Screenshot (empty = built-in drawing)',
            type: 'image' as const,
          },
        ],
      })),
    ],
  },
  {
    id: 'guide',
    label: 'Install video',
    icon: 'video',
    groups: [
      head(),
      {
        title: 'Video',
        fields: [
          { path: 'videoUrl', label: 'Video file (16:9) or YouTube link', type: 'video' },
          { path: 'posterUrl', label: 'Poster image', type: 'image' },
        ],
      },
      {
        title: 'Chapters',
        fields: DEFAULT_SITE.guide.chapters.map((_, i) => t(`chapters.${i}`, `Chapter ${i + 1} title`)),
      },
    ],
  },
  {
    id: 'manual',
    label: 'Manual',
    icon: 'book',
    groups: [head(), { title: 'Manual', fields: [{ path: 'pdfUrl', label: 'Manual PDF', type: 'file' }] }],
  },
  {
    id: 'download',
    label: 'App download',
    icon: 'dl',
    groups: [
      head(),
      {
        title: 'Store links',
        fields: [
          { path: 'playUrl', label: 'Google Play link', type: 'link', wide: true },
          { path: 'playLive', label: 'Google Play is live (hides "SOON")', type: 'toggle', wide: true },
          { path: 'appStoreUrl', label: 'App Store link', type: 'link', wide: true },
          { path: 'appStoreLive', label: 'App Store is live (hides "SOON")', type: 'toggle', wide: true },
        ],
      },
    ],
  },
  {
    id: 'store',
    label: 'Store',
    icon: 'cart',
    groups: [
      {
        title: 'Home page teaser',
        fields: [t('kicker', 'Small label'), t('title', 'Title'), t('badge', 'Badge')],
      },
    ],
  },
  {
    id: 'contact',
    label: 'Contact info',
    icon: 'mail',
    groups: [
      { title: 'Company', fields: [t('company', 'Company name', true)] },
      {
        title: 'Contact',
        fields: [t('phone', 'Phone'), t('email', 'Email'), t('address', 'Address'), t('website', 'Website')],
      },
    ],
  },
];

export const sectionDef = (id: string) => EDITOR.find((s) => s.id === id);

/* ---------- paths ---------- */

export function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

/** Immutable set: returns a copy with the value at `path` replaced. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [k, ...rest] = path.split('.');
  const src = obj as unknown as Record<string, unknown> | unknown[];
  const copy: Record<string, unknown> | unknown[] = Array.isArray(src) ? [...src] : { ...src };
  (copy as Record<string, unknown>)[k] = rest.length
    ? setPath((src as Record<string, unknown>)[k], rest.join('.'), value)
    : value;
  return copy as T;
}

/* ---------- checks ---------- */

const MAX_TEXT = 200;
const MAX_URL = 500;

/** Our own uploads, files in /public, or an in-page anchor. */
export const isSiteUrl = (s: string) => /^\/(?!\/)[^\s]*$/.test(s) || /^#[\w-]*$/.test(s);
export const isWebUrl = (s: string) => /^https:\/\/[^\s/$.?#][^\s]*$/i.test(s);
export const isMediaUrl = (s: string) => /^\/(?!\/)[^\s]*$/.test(s);

/** Why a field value is not allowed, or null when fine. */
export function fieldError(f: Field, v: unknown): string | null {
  switch (f.type) {
    case 'toggle':
      return typeof v === 'boolean' ? null : 'Must be on or off';
    case 'text':
    case 'area': {
      if (typeof v !== 'string') return 'Must be text';
      return v.length > (f.max ?? MAX_TEXT) ? `Keep it under ${f.max ?? MAX_TEXT} characters` : null;
    }
    case 'link': {
      if (typeof v !== 'string' || v.length > MAX_URL) return 'Not a link';
      return v === '' || isWebUrl(v) || isSiteUrl(v) ? null : 'Use a full https:// link';
    }
    case 'image':
    case 'file': {
      if (v === null || v === '') return null;
      return typeof v === 'string' && v.length <= MAX_URL && isMediaUrl(v) ? null : 'Upload a file';
    }
    case 'video': {
      if (v === null || v === '') return null;
      if (typeof v !== 'string' || v.length > MAX_URL) return 'Not a video';
      return isMediaUrl(v) || youtubeId(v) ? null : 'Upload a video or paste a YouTube link';
    }
  }
}

/** Values the page cannot do without get their default back when cleared. */
function fillRequired(id: SectionId, c: Record<string, unknown>) {
  const d = DEFAULT_SITE[id] as unknown as Record<string, unknown>;
  for (const k of ['imageUrl', 'posterUrl'] as const) if (k in d && !c[k]) c[k] = d[k];
  for (const k of ['videoUrl', 'pdfUrl'] as const) if (k in d && c[k] === '') c[k] = null;
  if (id === 'gallery') {
    for (const s of c.shots as { imageUrl: string | null }[]) if (!s.imageUrl) s.imageUrl = null;
  }
}

/** "+91 98632 62589" → "+919863262589" */
export const telOf = (phone: string) => {
  const d = phone.replace(/[^\d+]/g, '');
  return d.startsWith('+') ? d : d.length === 10 ? `+91${d}` : d;
};

export type CleanResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Check one section as sent by the editor: shape from the defaults, every editable field
 * through its rule, and fields the editor does not show are kept from `current`.
 */
export function cleanSection(
  id: SectionId,
  input: unknown,
  current: SiteContent,
): CleanResult<SiteContent[SectionId]> {
  const def = sectionDef(id);
  if (!def) return { ok: false, error: 'Unknown section' };
  let out = structuredClone(current[id]) as unknown as Record<string, unknown>;
  const shaped = conform(input, DEFAULT_SITE[id]);
  for (const g of def.groups) {
    for (const f of g.fields) {
      let v = getPath(shaped, f.path);
      if (typeof v === 'string') v = f.type === 'area' ? v.trim() : v.trim().replace(/\s+/g, ' ');
      const err = fieldError(f, v);
      if (err) return { ok: false, error: `${g.title} › ${f.label}: ${err}` };
      out = setPath(out, f.path, v);
    }
  }
  fillRequired(id, out);
  if (id === 'contact') out.phoneTel = telOf(String(out.phone));
  return { ok: true, value: out as unknown as SiteContent[SectionId] };
}

/* ---------- store products + ordering (applied to their own tables on Publish) ---------- */

export type ShopProduct = {
  id: string;
  name: string;
  price: number | null;
  imageUrl: string | null;
  visible: boolean;
};
export type Shop = { orderingOpen: boolean; products: ShopProduct[] };

export function cleanShop(input: unknown, current: Shop): CleanResult<Shop> {
  const i = (input ?? {}) as Partial<Shop>;
  if (typeof i.orderingOpen !== 'boolean' || !Array.isArray(i.products))
    return { ok: false, error: 'Bad store data' };
  const byId = new Map(i.products.map((p) => [p?.id, p]));
  const products: ShopProduct[] = [];
  for (const cur of current.products) {
    const p = byId.get(cur.id) ?? cur;
    const name = typeof p.name === 'string' ? p.name.trim().replace(/\s+/g, ' ') : '';
    if (!name || name.length > 80) return { ok: false, error: `${cur.name}: name is 1–80 characters` };
    const price = p.price === null || p.price === undefined ? null : Number(p.price);
    if (price !== null && !(Number.isInteger(price) && price >= 0 && price <= 10_000_000)) {
      return { ok: false, error: `${name}: price must be whole rupees` };
    }
    const img = p.imageUrl || null;
    if (img !== null && !(typeof img === 'string' && img.startsWith('/media/') && isMediaUrl(img))) {
      return { ok: false, error: `${name}: upload the photo` };
    }
    if (typeof p.visible !== 'boolean') return { ok: false, error: `${name}: bad "Show in store"` };
    products.push({ id: cur.id, name, price, imageUrl: img, visible: p.visible });
  }
  return { ok: true, value: { orderingOpen: i.orderingOpen, products } };
}

export const DEFAULT_SHOP: Shop = {
  orderingOpen: false,
  products: DEFAULT_PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    imageUrl: null,
    visible: true,
  })),
};

/* ---------- where a file is used (Media page) ---------- */

/** "Hero · Background" for every field holding `url`, in draft or live content. */
export function usesOf(url: string, contents: SiteContent[], shops: Shop[]): string[] {
  const out = new Set<string>();
  for (const c of contents) {
    for (const s of EDITOR) {
      for (const g of s.groups) {
        for (const f of g.fields) if (getPath(c[s.id], f.path) === url) out.add(`${s.label} · ${g.title}`);
      }
    }
  }
  for (const sh of shops) for (const p of sh.products) if (p.imageUrl === url) out.add(`Store · ${p.name}`);
  return [...out];
}
