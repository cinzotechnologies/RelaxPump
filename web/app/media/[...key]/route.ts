import { envAsync } from '@/lib/env';

// Uploaded keys are unique (a new upload gets a new key), so files can be cached for a year.
const CACHE = 'public, max-age=31536000, immutable';

/** Parse "bytes=start-end" into an R2 range. */
function range(header: string | null, size?: number): R2Range | undefined {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return undefined;
  if (!m[1]) return { suffix: Number(m[2]) };
  const offset = Number(m[1]);
  const end = m[2] ? Number(m[2]) : size !== undefined ? size - 1 : undefined;
  return end === undefined ? { offset } : { offset, length: end - offset + 1 };
}

/** Serve an R2 object (images, video with range requests, the manual PDF). */
export async function GET(req: Request, ctx: RouteContext<'/media/[...key]'>) {
  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join('/');
  if (!key || key.includes('..')) return new Response('Not found', { status: 404 });

  const bucket = (await envAsync()).MEDIA;
  const rangeHeader = req.headers.get('range');
  let size: number | undefined;
  if (rangeHeader) size = (await bucket.head(key))?.size;
  const r = range(rangeHeader, size);
  const obj = await bucket.get(key, {
    onlyIf: req.headers,
    ...(r ? { range: r } : {}),
  });
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set('cache-control', CACHE);
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');

  if (!('body' in obj)) return new Response(null, { status: 304, headers });

  if (r && obj.range && 'offset' in obj.range) {
    const start = obj.range.offset ?? 0;
    const len = obj.range.length ?? obj.size - start;
    headers.set('content-range', `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set('content-length', String(len));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
}
