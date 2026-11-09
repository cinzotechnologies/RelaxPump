// Media library: files in R2 (bucket relaxpump-media) with a row each in D1 `media`.
import 'server-only';

import { desc, eq } from 'drizzle-orm';

import { audit } from '@/lib/admin/audit';
import { loadEditor } from '@/lib/admin/content';
import { usesOf } from '@/lib/admin/editor';
import { mediaUrl } from '@/lib/content/load';
import { db, schema } from '@/lib/db';
import { envAsync } from '@/lib/env';

const MB = 1024 * 1024;

/** Allowed uploads and their size limits. No SVG: it can carry scripts. */
export const UPLOAD_TYPES: Record<string, { kind: 'image' | 'video' | 'file'; max: number }> = {
  'image/jpeg': { kind: 'image', max: 10 * MB },
  'image/png': { kind: 'image', max: 10 * MB },
  'image/webp': { kind: 'image', max: 10 * MB },
  'image/avif': { kind: 'image', max: 10 * MB },
  'image/gif': { kind: 'image', max: 10 * MB },
  'video/mp4': { kind: 'video', max: 95 * MB }, // Workers request limit is 100 MB
  'video/webm': { kind: 'video', max: 95 * MB },
  'application/pdf': { kind: 'file', max: 30 * MB },
};

export type MediaItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  createdAt: number;
  uses: string[];
};

/** "My Photo (1).JPG" → "my-photo-1.jpg" */
export function safeName(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 5)
      : '';
  return (base || 'file') + (ext ? `.${ext}` : '');
}

export async function listMedia(): Promise<MediaItem[]> {
  const [rows, st] = await Promise.all([
    (await db()).select().from(schema.media).orderBy(desc(schema.media.createdAt)),
    loadEditor(),
  ]);
  return rows.map((r) => {
    const url = mediaUrl(r.r2Key);
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      size: r.size,
      url,
      createdAt: r.createdAt,
      uses: usesOf(url, [st.draft, st.live], [st.shop, st.liveShop]),
    };
  });
}

export type UploadResult = { ok: true; item: MediaItem } | { ok: false; error: string; status: number };

export async function uploadMedia(file: File, who: string): Promise<UploadResult> {
  const rule = UPLOAD_TYPES[file.type];
  if (!rule) return { ok: false, error: 'Use a JPG, PNG, WebP, GIF, MP4, WebM or PDF file', status: 415 };
  if (file.size === 0) return { ok: false, error: 'The file is empty', status: 400 };
  if (file.size > rule.max) {
    return { ok: false, error: `Too big — the limit is ${Math.round(rule.max / MB)} MB`, status: 413 };
  }
  const id = crypto.randomUUID();
  const now = new Date();
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${id.slice(0, 8)}-${safeName(file.name)}`;
  const name = file.name.slice(0, 120) || 'file';

  // R2 needs a known length: stream it on Workers; `next dev` (Node) has no FixedLengthStream.
  const body =
    typeof FixedLengthStream === 'function'
      ? file.stream().pipeThrough(new FixedLengthStream(file.size))
      : await file.arrayBuffer();
  await (
    await envAsync()
  ).MEDIA.put(key, body, {
    httpMetadata: {
      contentType: file.type,
      contentDisposition: rule.kind === 'file' ? `inline; filename="${safeName(file.name)}"` : undefined,
    },
  });
  await (await db()).insert(schema.media).values({
    id,
    r2Key: key,
    name,
    type: file.type,
    size: file.size,
    usedIn: null,
    createdAt: now.getTime(),
  });
  await audit(who, 'media.upload', { id, key, name, size: file.size });
  return {
    ok: true,
    item: {
      id,
      name,
      type: file.type,
      size: file.size,
      url: mediaUrl(key),
      createdAt: now.getTime(),
      uses: [],
    },
  };
}

/** Delete a file that nothing (draft or live) uses. */
export async function deleteMedia(
  id: string,
  who: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const d = await db();
  const row = await d.select().from(schema.media).where(eq(schema.media.id, id)).get();
  if (!row) return { ok: false, error: 'Not found', status: 404 };
  const st = await loadEditor();
  const uses = usesOf(mediaUrl(row.r2Key), [st.draft, st.live], [st.shop, st.liveShop]);
  if (uses.length) return { ok: false, error: `Still used: ${uses.join(', ')}`, status: 409 };
  await (await envAsync()).MEDIA.delete(row.r2Key);
  await d.delete(schema.media).where(eq(schema.media.id, id));
  await audit(who, 'media.delete', { id, key: row.r2Key, name: row.name });
  return { ok: true };
}
