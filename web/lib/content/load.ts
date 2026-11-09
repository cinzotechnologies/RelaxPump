// Read the published website from D1. Any failure falls back to the design copy, so a
// broken or empty database never takes the site down. In admin Preview (Next draft mode) the
// pages show the unpublished drafts instead.
import 'server-only';

import { and, asc, eq } from 'drizzle-orm';
import { draftMode } from 'next/headers';
import { cache } from 'react';

import { db, schema } from '@/lib/db';

import { DEFAULT_PRODUCTS, type Product, type ProductArtKind, type ProductCategory } from './products';
import { DEFAULT_SITE, mergeContent, type SiteContent } from './sections';

/** Public URL of an R2 object (served by app/media/[...key]). */
export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`;

/** Admin "Preview" turned on draft mode for this browser. */
export const isPreview = cache(async (): Promise<boolean> => {
  try {
    return (await draftMode()).isEnabled;
  } catch {
    return false;
  }
});

export const getSite = cache(async (): Promise<SiteContent> => {
  try {
    const preview = await isPreview();
    const rows = await (await db()).select().from(schema.content);
    return mergeContent(
      rows.map((r) => ({
        section: r.section,
        key: r.key,
        value: preview ? (r.draft ?? r.published) : r.published,
      })),
    );
  } catch (e) {
    console.error('content: falling back to defaults', e);
    return DEFAULT_SITE;
  }
});

const CATS: ProductCategory[] = ['Kits', 'Add-ons', 'Service'];
const ARTS: ProductArtKind[] = ['ctrl', 'sensor', 'valve', 'relay', 'install'];

type ShopDraft = {
  orderingOpen: boolean;
  products: { id: string; name: string; price: number | null; imageUrl: string | null; visible: boolean }[];
};

/** The unpublished store draft (only read in preview). */
async function shopDraft(): Promise<ShopDraft | null> {
  try {
    const row = await (
      await db()
    )
      .select({ draft: schema.content.draft })
      .from(schema.content)
      .where(and(eq(schema.content.section, 'shop'), eq(schema.content.key, 'data')))
      .get();
    return row?.draft ? (JSON.parse(row.draft) as ShopDraft) : null;
  } catch {
    return null;
  }
}

/** Visible products. Pages pass `preview` (from isPreview) to see the store draft; APIs never do. */
export const getProducts = cache(async (preview = false): Promise<Product[]> => {
  try {
    const rows = await (
      await db()
    )
      .select()
      .from(schema.products)
      .orderBy(asc(schema.products.sort), asc(schema.products.name));
    const draft = preview ? new Map((await shopDraft())?.products.map((p) => [p.id, p])) : null;
    return rows.flatMap((r): Product[] => {
      const d = draft?.get(r.id);
      if (!(d ? d.visible : r.visible)) return [];
      return [
        {
          id: r.id,
          name: d?.name ?? r.name,
          desc: r.description,
          category: CATS.includes(r.category as ProductCategory)
            ? (r.category as ProductCategory)
            : 'Add-ons',
          tag: r.tag,
          art: ARTS.includes(r.art as ProductArtKind) ? (r.art as ProductArtKind) : 'ctrl',
          price: d ? d.price : r.price,
          imageUrl: d ? d.imageUrl : r.imageKey ? mediaUrl(r.imageKey) : null,
          featured: r.featured,
        },
      ];
    });
  } catch (e) {
    console.error('products: falling back to defaults', e);
    return DEFAULT_PRODUCTS;
  }
});

export const getSetting = cache(async (key: string): Promise<string | null> => {
  try {
    const row = await (await db()).select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    return row?.value ?? null;
  } catch {
    return null;
  }
});

/** Whether online ordering is open. Pages pass `preview` to see the store draft's switch. */
export async function orderingOpen(preview = false): Promise<boolean> {
  if (preview) {
    const d = await shopDraft();
    if (d) return d.orderingOpen === true;
  }
  return (await getSetting('ordering_open')) === 'true';
}
