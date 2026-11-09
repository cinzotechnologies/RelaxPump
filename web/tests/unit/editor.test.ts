import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn(), draftMode: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/env', () => ({ envAsync: vi.fn(), env: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: vi.fn(), schema: {} }));

const { cleanSection, cleanShop, DEFAULT_SHOP, EDITOR, fieldError, getPath, setPath, telOf, usesOf } =
  await import('@/lib/admin/editor');
const { DEFAULT_SITE, conform, mergeContent } = await import('@/lib/content/sections');
const { youtubeId } = await import('@/lib/content/youtube');
const { sameOrigin } = await import('@/lib/admin/auth');
const { keyOfMediaUrl } = await import('@/lib/admin/content');
const { safeName } = await import('@/lib/admin/media');

describe('editor field map', () => {
  it('every field points at a real value of the right kind', () => {
    for (const s of EDITOR) {
      for (const g of s.groups) {
        for (const f of g.fields) {
          const v = getPath(DEFAULT_SITE[s.id], f.path);
          expect(v, `${s.id}.${f.path}`).not.toBeUndefined();
          expect(fieldError(f, v), `${s.id}.${f.path}`).toBeNull();
        }
      }
    }
  });
  it('covers the eight admin sections in order', () => {
    expect(EDITOR.map((s) => s.label)).toEqual([
      'Hero',
      'How it works',
      'App screens',
      'Install video',
      'Manual',
      'App download',
      'Store',
      'Contact info',
    ]);
  });
});

describe('paths', () => {
  it('sets without touching the original', () => {
    const a = { x: { list: [{ t: 'a' }, { t: 'b' }] } };
    const b = setPath(a, 'x.list.1.t', 'B');
    expect(b.x.list[1].t).toBe('B');
    expect(a.x.list[1].t).toBe('b');
    expect(Array.isArray(b.x.list)).toBe(true);
    expect(getPath(b, 'x.list.0.t')).toBe('a');
  });
});

describe('cleanSection', () => {
  it('saves edits, trims text and keeps hidden fields', () => {
    const input = setPath(DEFAULT_SITE.how, 'feats.0.t', '  Live   levels now ');
    const r = cleanSection('how', input, DEFAULT_SITE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const how = r.value as typeof DEFAULT_SITE.how;
    expect(how.feats[0].t).toBe('Live levels now');
    expect(how.feats[0].screen).toBe('home'); // not editable → kept
  });
  it('refuses a javascript: link and an outside media URL', () => {
    const bad = { ...DEFAULT_SITE.download, playUrl: 'javascript:alert(1)' };
    expect(cleanSection('download', bad, DEFAULT_SITE).ok).toBe(false);
    const ext = { ...DEFAULT_SITE.hero, imageUrl: 'https://evil.example/x.jpg' };
    expect(cleanSection('hero', ext, DEFAULT_SITE).ok).toBe(false);
    const proto = { ...DEFAULT_SITE.hero, imageUrl: '//evil.example/x.jpg' };
    expect(cleanSection('hero', proto, DEFAULT_SITE).ok).toBe(false);
  });
  it('takes a YouTube link or an upload for the video, nothing else', () => {
    const yt = { ...DEFAULT_SITE.guide, videoUrl: 'https://youtu.be/dQw4w9WgXcQ' };
    expect(cleanSection('guide', yt, DEFAULT_SITE).ok).toBe(true);
    const up = { ...DEFAULT_SITE.guide, videoUrl: '/media/2026/11/ab-install.mp4' };
    expect(cleanSection('guide', up, DEFAULT_SITE).ok).toBe(true);
    const vimeo = { ...DEFAULT_SITE.guide, videoUrl: 'https://vimeo.com/1' };
    expect(cleanSection('guide', vimeo, DEFAULT_SITE).ok).toBe(false);
  });
  it('puts the hero image back when it is removed, and empties the PDF to null', () => {
    const r = cleanSection('hero', { ...DEFAULT_SITE.hero, imageUrl: null }, DEFAULT_SITE);
    expect(r.ok && (r.value as typeof DEFAULT_SITE.hero).imageUrl).toBe('/hero-water.jpg');
    const m = cleanSection('manual', { ...DEFAULT_SITE.manual, pdfUrl: '' }, DEFAULT_SITE);
    expect(m.ok && (m.value as typeof DEFAULT_SITE.manual).pdfUrl).toBeNull();
  });
  it('keeps the tel: number in step with the phone', () => {
    const r = cleanSection('contact', { ...DEFAULT_SITE.contact, phone: '+91 70051 23456' }, DEFAULT_SITE);
    expect(r.ok && (r.value as typeof DEFAULT_SITE.contact).phoneTel).toBe('+917005123456');
    expect(telOf('98632 62589')).toBe('+919863262589');
  });
  it('refuses too-long text', () => {
    const r = cleanSection('hero', { ...DEFAULT_SITE.hero, titleA: 'x'.repeat(201) }, DEFAULT_SITE);
    expect(r.ok).toBe(false);
  });
});

describe('cleanShop', () => {
  it('accepts prices in whole rupees and keeps product ids fixed', () => {
    const input = {
      orderingOpen: true,
      products: [
        { ...DEFAULT_SHOP.products[0], price: 4999 },
        { id: 'evil', name: 'x', price: 1, imageUrl: null, visible: true },
      ],
    };
    const r = cleanShop(input, DEFAULT_SHOP);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.products.map((p) => p.id)).toEqual(DEFAULT_SHOP.products.map((p) => p.id));
    expect(r.value.products[0].price).toBe(4999);
    expect(r.value.orderingOpen).toBe(true);
  });
  it('refuses bad prices, photos and empty names', () => {
    const p = (patch: object) => ({
      orderingOpen: false,
      products: [{ ...DEFAULT_SHOP.products[0], ...patch }],
    });
    expect(cleanShop(p({ price: -1 }), DEFAULT_SHOP).ok).toBe(false);
    expect(cleanShop(p({ price: 9.5 }), DEFAULT_SHOP).ok).toBe(false);
    expect(cleanShop(p({ name: '  ' }), DEFAULT_SHOP).ok).toBe(false);
    expect(cleanShop(p({ imageUrl: '/hero-water.jpg' }), DEFAULT_SHOP).ok).toBe(false);
    expect(cleanShop(p({ imageUrl: '/media/2026/11/a-kit.jpg' }), DEFAULT_SHOP).ok).toBe(true);
  });
});

describe('conform (deep content check)', () => {
  it('fills new fields on old rows and drops wrong types inside arrays', () => {
    const oldShots = DEFAULT_SITE.gallery.shots.map(({ imageUrl: _i, ...s }) => s);
    const merged = mergeContent([{ section: 'gallery', key: 'shots', value: JSON.stringify(oldShots) }]);
    expect(merged.gallery.shots[0].imageUrl).toBeNull();
    const bad = [{ ...DEFAULT_SITE.how.feats[0], t: 42 }];
    expect((conform(bad, DEFAULT_SITE.how.feats) as typeof DEFAULT_SITE.how.feats)[0].t).toBe('Live levels');
  });
  it('keeps manual pages of another kind as stored', () => {
    const pages = DEFAULT_SITE.manual.pages;
    expect(conform(pages, pages)).toEqual(pages);
  });
});

describe('media helpers', () => {
  it('finds where a file is used', () => {
    const url = '/media/2026/11/ab-hero.jpg';
    const c = setPath(DEFAULT_SITE, 'hero.imageUrl', url);
    const shop = {
      ...DEFAULT_SHOP,
      products: DEFAULT_SHOP.products.map((p, i) => (i === 0 ? { ...p, imageUrl: url } : p)),
    };
    expect(usesOf(url, [c], [shop])).toEqual(['Hero · Background', 'Store · RelaxPump Controller Kit']);
    expect(usesOf('/media/none.jpg', [c], [shop])).toEqual([]);
  });
  it('makes safe R2 names and reads keys back', () => {
    expect(safeName('My Photo (1).JPG')).toBe('my-photo-1.jpg');
    expect(safeName('../../etc/passwd')).toMatch(/^[a-z0-9.-]+$/);
    expect(safeName('../../etc/passwd')).not.toContain('..');
    expect(keyOfMediaUrl('/media/2026/11/ab%20c.jpg')).toBe('2026/11/ab c.jpg');
    expect(keyOfMediaUrl('/hero-water.jpg')).toBeNull();
  });
  it('reads YouTube ids', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
  });
});

describe('same-origin check', () => {
  const req = (h: Record<string, string>) =>
    new Request('https://x.test/api/admin/publish', { method: 'POST', headers: h });
  it('needs Origin to match Host', () => {
    expect(sameOrigin(req({ origin: 'https://x.test', host: 'x.test' }))).toBe(true);
    expect(sameOrigin(req({ origin: 'https://evil.test', host: 'x.test' }))).toBe(false);
    expect(sameOrigin(req({ host: 'x.test' }))).toBe(false);
  });
});
