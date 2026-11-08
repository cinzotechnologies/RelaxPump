// Read the published website from D1. Any failure falls back to the design copy, so a
// broken or empty database never takes the site down.
import 'server-only';

import { asc, eq } from 'drizzle-orm';
import { cache } from 'react';

import { db, schema } from '@/lib/db';

import { DEFAULT_PRODUCTS, type Product, type ProductArtKind, type ProductCategory } from './products';
import { DEFAULT_SITE, mergeContent, type SiteContent } from './sections';

/** Public URL of an R2 object (served by app/media/[...key]). */
export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`;

export const getSite = cache(async (): Promise<SiteContent> => {
  try {
    const rows = await (
      await db()
    )
      .select({ section: schema.content.section, key: schema.content.key, value: schema.content.published })
      .from(schema.content);
    return mergeContent(rows);
  } catch (e) {
    console.error('content: falling back to defaults', e);
    return DEFAULT_SITE;
  }
});

const CATS: ProductCategory[] = ['Kits', 'Add-ons', 'Service'];
const ARTS: ProductArtKind[] = ['ctrl', 'sensor', 'valve', 'relay', 'install'];

export const getProducts = cache(async (): Promise<Product[]> => {
  try {
    const rows = await (
      await db()
    )
      .select()
      .from(schema.products)
      .where(eq(schema.products.visible, true))
      .orderBy(asc(schema.products.sort), asc(schema.products.name));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      desc: r.description,
      category: CATS.includes(r.category as ProductCategory) ? (r.category as ProductCategory) : 'Add-ons',
      tag: r.tag,
      art: ARTS.includes(r.art as ProductArtKind) ? (r.art as ProductArtKind) : 'ctrl',
      price: r.price,
      imageUrl: r.imageKey ? mediaUrl(r.imageKey) : null,
      featured: r.featured,
    }));
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

export async function orderingOpen(): Promise<boolean> {
  return (await getSetting('ordering_open')) === 'true';
}
