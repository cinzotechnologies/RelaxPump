'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { EDITOR, type Field, getPath, setPath, type Shop } from '@/lib/admin/editor';
import type { SectionId, SiteContent } from '@/lib/content/sections';

import { MediaField, Switch } from './fields';
import { AIcon, IC, whenLabel } from './icons';
import { useToast } from './Toast';

type Props = {
  draft: SiteContent;
  live: SiteContent;
  shop: Shop;
  liveShop: Shop;

  lastPublished: number | null;
  startSec: string;
};

type SaveKey = SectionId | 'shop';
const SAVE_DELAY = 700;

/** Website content editor: edits save as a draft on their own; Publish puts them live. */
export function WebsiteEditor(p: Props) {
  const [content, setContent] = useState(p.draft);
  const [shop, setShop] = useState(p.shop);
  const [sec, setSec] = useState<SectionId>(
    EDITOR.some((s) => s.id === p.startSec) ? (p.startSec as SectionId) : 'hero',
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [busy, setBusy] = useState(false);
  const [pubAt, setPubAt] = useState(p.lastPublished);
  const { toast, say } = useToast();

  const [live, setLive] = useState({ content: p.live, shop: p.liveShop });
  const latest = useRef({ content, shop });
  useEffect(() => {
    latest.current = { content, shop };
  }, [content, shop]);
  const timers = useRef(new Map<SaveKey, ReturnType<typeof setTimeout>>());
  const inflight = useRef(new Set<Promise<boolean>>());

  const save = useCallback(
    async (key: SaveKey): Promise<boolean> => {
      timers.current.delete(key);
      setStatus('saving');
      const value = key === 'shop' ? latest.current.shop : latest.current.content[key];
      const run = fetch('/api/admin/content', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ section: key, value }),
      })
        .then(async (r) => {
          if (r.ok) return true;
          const b = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(b?.error ?? `Could not save (${r.status})`);
        })
        .then(
          () => {
            if (!timers.current.size) setStatus('saved');
            return true;
          },
          (e: Error) => {
            setStatus('error');
            say(e.message);
            return false;
          },
        );
      inflight.current.add(run);
      void run.finally(() => inflight.current.delete(run));
      return run;
    },
    [say],
  );

  const schedule = useCallback(
    (key: SaveKey) => {
      setStatus('saving');
      clearTimeout(timers.current.get(key));
      timers.current.set(
        key,
        setTimeout(() => void save(key), SAVE_DELAY),
      );
    },
    [save],
  );

  /** Save anything still waiting; true when all saved. */
  const flush = useCallback(async () => {
    const keys = [...timers.current.keys()];
    keys.forEach((k) => clearTimeout(timers.current.get(k)));
    const results = await Promise.all([...inflight.current, ...keys.map((k) => save(k))]);
    return results.every(Boolean);
  }, [save]);

  // warn before leaving with edits not yet saved
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (timers.current.size || inflight.current.size) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);

  const setField = (path: string, v: unknown) => {
    setContent((c) => setPath(c, `${sec}.${path}`, v));
    schedule(sec);
  };
  const setShopVal = (next: Shop) => {
    setShop(next);
    schedule('shop');
  };

  function pickSec(id: SectionId) {
    setSec(id);
    const u = new URL(window.location.href);
    u.searchParams.set('sec', id);
    window.history.replaceState(null, '', u);
  }

  async function publish() {
    setBusy(true);
    try {
      if (!(await flush())) return;
      const r = await fetch('/api/admin/publish', { method: 'POST' });
      const b = (await r.json().catch(() => null)) as { at?: number; error?: string } | null;
      if (!r.ok || !b?.at) throw new Error(b?.error ?? 'Could not publish');
      setLive({ content: latest.current.content, shop: latest.current.shop });
      setPubAt(b.at);
      setStatus('idle');
      say('Published to the website');
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!window.confirm('Throw away every change that is not published yet?')) return;
    setBusy(true);
    try {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
      await Promise.all([...inflight.current]);
      const r = await fetch('/api/admin/discard', { method: 'POST' });
      if (!r.ok) throw new Error('Could not discard');
      setContent(live.content);
      setShop(live.shop);
      setStatus('idle');
      say('Changes discarded');
    } catch (e) {
      say((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    await flush();
    window.open(`/api/admin/preview?to=${sec === 'store' ? '/store' : '/'}`, '_blank', 'noopener');
  }

  const def = EDITOR.find((s) => s.id === sec)!;
  const secValue = content[sec];
  const changed = (id: SectionId) => JSON.stringify(content[id]) !== JSON.stringify(live.content[id]);
  const shopChanged = JSON.stringify(shop) !== JSON.stringify(live.shop);
  // the server clears a field's draft when it equals the live value, so this matches D1
  const dirty = shopChanged || EDITOR.some((s) => changed(s.id));

  return (
    <>
      <header className="top">
        <h1>Website content</h1>
        {dirty ? (
          <span className="unsaved">
            <span className="adot" />
            Unpublished changes
          </span>
        ) : null}
        <span className="grow" />
        <span className="ghost" aria-live="polite">
          {status === 'saving'
            ? 'Saving draft…'
            : status === 'error'
              ? 'Not saved'
              : `Published ${whenLabel(pubAt)}`}
        </span>
        <button className="abtn" type="button" onClick={discard} disabled={!dirty || busy}>
          Discard
        </button>
        <button className="abtn strong" type="button" onClick={publish} disabled={!dirty || busy}>
          Publish
        </button>
      </header>
      <div className="abody">
        <div className="aed">
          <div className="card asecs" role="tablist" aria-label="Website sections">
            {EDITOR.map((s) => (
              <button
                key={s.id}
                className={s.id === sec ? 'asec on' : 'asec'}
                type="button"
                role="tab"
                aria-selected={s.id === sec}
                onClick={() => pickSec(s.id)}
              >
                <AIcon d={IC[s.icon as keyof typeof IC]} size={18} />
                {s.label}
                {changed(s.id) || (s.id === 'store' && shopChanged) ? (
                  <span className="adot" title="Not published yet" />
                ) : null}
              </button>
            ))}
          </div>
          <div className="card">
            <div className="ch">
              <h2>{def.label}</h2>
              <button className="abtn" type="button" onClick={preview}>
                Preview
              </button>
            </div>
            {def.groups.map((g) => (
              <div className="agrp" key={g.title}>
                <h3>{g.title}</h3>
                <div className="afields">
                  {g.fields.map((f) => (
                    <FieldInput
                      key={f.path}
                      f={f}
                      value={getPath(secValue, f.path)}
                      onChange={(v) => setField(f.path, v)}
                      onError={say}
                    />
                  ))}
                </div>
              </div>
            ))}
            {sec === 'store' ? <ShopGroups shop={shop} onChange={setShopVal} onError={say} /> : null}
          </div>
        </div>
      </div>
      {toast}
    </>
  );
}

function FieldInput({
  f,
  value,
  onChange,
  onError,
}: {
  f: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  onError: (m: string) => void;
}) {
  const cls = f.wide ? 'afld wide' : 'afld';
  switch (f.type) {
    case 'toggle':
      return <Switch on={value === true} label={f.label} onChange={onChange} wide={f.wide} />;
    case 'area':
      return (
        <label className="afld wide">
          {f.label}
          <textarea
            className="ainp ata"
            value={String(value ?? '')}
            maxLength={f.max ?? 200}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
    case 'image':
    case 'video':
    case 'file':
      return (
        <MediaField
          kind={f.type}
          label={f.label}
          value={(value as string | null) || null}
          onChange={onChange}
          onError={onError}
          emptyName={
            f.type === 'image'
              ? 'Using the built-in drawing'
              : f.type === 'video'
                ? 'No video yet'
                : 'No PDF yet'
          }
        />
      );
    default:
      return (
        <label className={cls}>
          {f.label}
          <input
            className="ainp"
            type={f.type === 'link' ? 'url' : 'text'}
            placeholder={f.type === 'link' ? 'https://' : undefined}
            value={String(value ?? '')}
            maxLength={f.type === 'link' ? 500 : (f.max ?? 200)}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
  }
}

/** Store: the ordering switch and each product (name, price, photo, shown). */
function ShopGroups({
  shop,
  onChange,
  onError,
}: {
  shop: Shop;
  onChange: (s: Shop) => void;
  onError: (m: string) => void;
}) {
  const setP = (i: number, patch: Partial<Shop['products'][number]>) =>
    onChange({ ...shop, products: shop.products.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  return (
    <>
      <div className="agrp">
        <h3>Ordering</h3>
        <div className="afields">
          <Switch
            on={shop.orderingOpen}
            label="Online ordering open"
            wide
            onChange={(v) => onChange({ ...shop, orderingOpen: v })}
          />
        </div>
      </div>
      {shop.products.map((p, i) => (
        <div className="agrp" key={p.id}>
          <h3>{p.name || p.id}</h3>
          <div className="afields">
            <label className="afld">
              Name
              <input
                className="ainp"
                value={p.name}
                maxLength={80}
                onChange={(e) => setP(i, { name: e.target.value })}
              />
            </label>
            <label className="afld">
              Price (₹) — empty = coming soon
              <input
                className="ainp"
                inputMode="numeric"
                value={p.price ?? ''}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 8);
                  setP(i, { price: d ? Number(d) : null });
                }}
              />
            </label>
            <MediaField
              kind="image"
              label="Photo"
              value={p.imageUrl}
              onChange={(v) => setP(i, { imageUrl: v })}
              onError={onError}
              emptyName="Using the drawing"
            />
            <Switch on={p.visible} label="Show in store" wide onChange={(v) => setP(i, { visible: v })} />
          </div>
        </div>
      ))}
    </>
  );
}
