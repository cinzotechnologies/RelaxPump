// Draft → publish for the website editor (docs/website-brief.md §3). Edits land in
// content.draft; Publish copies every draft into `published` (and the store draft into the
// products/settings tables) in one D1 batch; Discard clears the drafts.
import 'server-only';

import { asc, eq, isNotNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { audit } from '@/lib/admin/audit';
import { cleanSection, cleanShop, DEFAULT_SHOP, type Shop } from '@/lib/admin/editor';
import { mediaUrl } from '@/lib/content/load';
import { mergeContent, type SectionId, type SiteContent } from '@/lib/content/sections';
import { db, schema } from '@/lib/db';

const SHOP = { section: 'shop', key: 'data' } as const;

export type EditorState = {
  draft: SiteContent;
  live: SiteContent;
  shop: Shop;
  liveShop: Shop;
  /** Something differs from the live site. */
  hasDraft: boolean;
  lastPublished: number | null;
};

/** "/media/a/b%20c.jpg" → "a/b c.jpg"; null for anything that is not an upload. */
export function keyOfMediaUrl(url: string | null): string | null {
  if (!url?.startsWith('/media/')) return null;
  try {
    return url.slice(7).split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
}

async function liveShop(): Promise<Shop> {
  const d = await db();
  const [rows, open] = await Promise.all([
    d.select().from(schema.products).orderBy(asc(schema.products.sort), asc(schema.products.name)),
    d.select().from(schema.settings).where(eq(schema.settings.key, 'ordering_open')).get(),
  ]);
  if (!rows.length) return DEFAULT_SHOP;
  return {
    orderingOpen: open?.value === 'true',
    products: rows.map((r) => ({
      id: r.id,
      name: r.name,
      price: r.price,
      imageUrl: r.imageKey ? mediaUrl(r.imageKey) : null,
      visible: r.visible,
    })),
  };
}

export async function loadEditor(): Promise<EditorState> {
  const d = await db();
  const [rows, live, pub] = await Promise.all([
    d.select().from(schema.content),
    liveShop(),
    d.select().from(schema.settings).where(eq(schema.settings.key, 'last_published')).get(),
  ]);
  const site = rows.filter((r) => r.section !== SHOP.section);
  const shopRow = rows.find((r) => r.section === SHOP.section && r.key === SHOP.key);
  let shop = live;
  if (shopRow?.draft) {
    try {
      const c = cleanShop(JSON.parse(shopRow.draft), live);
      if (c.ok) shop = c.value;
    } catch {
      /* broken draft: show the live store */
    }
  }
  return {
    live: mergeContent(site.map((r) => ({ section: r.section, key: r.key, value: r.published }))),
    draft: mergeContent(site.map((r) => ({ section: r.section, key: r.key, value: r.draft ?? r.published }))),
    shop,
    liveShop: live,
    hasDraft: rows.some((r) => r.draft !== null),
    lastPublished: pub ? Number(pub.value) || null : null,
  };
}

/** Save one section as a draft. Fields equal to the live site clear their draft. */
export async function saveSection(id: SectionId, input: unknown, who: string) {
  const st = await loadEditor();
  const c = cleanSection(id, input, st.draft);
  if (!c.ok) return c;
  const d = await db();
  const now = Date.now();
  const live = st.live[id] as unknown as Record<string, unknown>;
  const ops = Object.entries(c.value as unknown as Record<string, unknown>).map(([key, v]) => {
    const json = JSON.stringify(v);
    const draft = json === JSON.stringify(live[key]) ? null : json;
    return d
      .insert(schema.content)
      .values({ section: id, key, draft, published: null, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.content.section, schema.content.key],
        set: { draft, updatedAt: now },
      });
  });
  const [first, ...rest] = ops;
  await d.batch([first, ...rest]);
  await audit(who, 'content.draft', { section: id });
  return { ok: true as const, value: c.value };
}

/** Save the store (ordering switch + products) as a draft. */
export async function saveShop(input: unknown, who: string) {
  const live = await liveShop();
  const c = cleanShop(input, live);
  if (!c.ok) return c;
  const json = JSON.stringify(c.value);
  const draft = json === JSON.stringify(live) ? null : json;
  const now = Date.now();
  await (
    await db()
  )
    .insert(schema.content)
    .values({ ...SHOP, draft, published: null, updatedAt: now })
    .onConflictDoUpdate({
      target: [schema.content.section, schema.content.key],
      set: { draft, updatedAt: now },
    });
  await audit(who, 'store.draft', null);
  return c;
}

/** Copy every draft live, in one batch, and refresh the public pages. */
export async function publishAll(who: string): Promise<{ at: number; changed: number }> {
  const d = await db();
  const st = await loadEditor();
  const now = Date.now();
  const drafts = await d
    .select({ section: schema.content.section, key: schema.content.key })
    .from(schema.content)
    .where(isNotNull(schema.content.draft));

  const shopChanged = drafts.some((r) => r.section === SHOP.section);
  const shopOps = shopChanged
    ? [
        ...st.shop.products.map((p) =>
          d
            .update(schema.products)
            .set({ name: p.name, price: p.price, imageKey: keyOfMediaUrl(p.imageUrl), visible: p.visible })
            .where(eq(schema.products.id, p.id)),
        ),
        d
          .insert(schema.settings)
          .values({ key: 'ordering_open', value: String(st.shop.orderingOpen) })
          .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(st.shop.orderingOpen) } }),
      ]
    : [];

  await d.batch([
    d
      .update(schema.content)
      .set({ published: sql`${schema.content.draft}`, draft: null, updatedAt: now })
      .where(isNotNull(schema.content.draft)),
    ...shopOps,
    d
      .insert(schema.settings)
      .values({ key: 'last_published', value: String(now) })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: String(now) } }),
  ]);
  await audit(who, 'content.publish', { fields: drafts.map((r) => `${r.section}.${r.key}`) });
  revalidatePath('/', 'layout');
  return { at: now, changed: drafts.length };
}

/** Throw away every draft. */
export async function discardAll(who: string) {
  await (await db()).update(schema.content).set({ draft: null }).where(isNotNull(schema.content.draft));
  await audit(who, 'content.discard', null);
}
