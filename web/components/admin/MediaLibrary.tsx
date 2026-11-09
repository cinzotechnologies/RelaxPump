'use client';

import { useState } from 'react';

import { ACCEPT, type MediaItem, uploadFile } from './fields';
import { AIcon, IC, sizeLabel } from './icons';
import { useToast } from './Toast';

/** Everything in R2: upload (images, video, PDF), where each file is used, delete unused ones. */
export function MediaLibrary({ initial }: { initial: MediaItem[] }) {
  const [items, setItems] = useState(initial);
  const [pct, setPct] = useState<number | null>(null);
  const { toast, say } = useToast();

  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    for (const f of files) {
      setPct(0);
      try {
        const item = await uploadFile(f, setPct);
        setItems((x) => [item, ...x]);
        say(`Uploaded ${item.name}`);
      } catch (err) {
        say(`${f.name}: ${(err as Error).message}`);
      }
    }
    setPct(null);
  }

  async function remove(m: MediaItem) {
    if (!window.confirm(`Delete ${m.name}? This cannot be undone.`)) return;
    const r = await fetch(`/api/admin/media/${m.id}`, { method: 'DELETE' });
    const b = (await r.json().catch(() => null)) as { error?: string } | null;
    if (!r.ok) return say(b?.error ?? 'Could not delete');
    setItems((x) => x.filter((i) => i.id !== m.id));
    say(`Deleted ${m.name}`);
  }

  return (
    <div className="card">
      <div className="ch">
        <h2>Images, videos and PDFs</h2>
        <span className="lbl">
          {items.length} {items.length === 1 ? 'file' : 'files'}
        </span>
      </div>
      <div className="amgrid">
        <label className="aupl" aria-disabled={pct !== null}>
          <AIcon d={IC.upload} size={24} />
          {pct !== null ? `Uploading… ${pct}%` : 'Upload'}
          <input
            type="file"
            multiple
            accept={`${ACCEPT.image},${ACCEPT.video},${ACCEPT.file}`}
            onChange={add}
            disabled={pct !== null}
          />
          {pct !== null ? <span className="abar" style={{ width: `${pct}%` }} /> : null}
        </label>
        {items.map((m) => (
          <div className="amt" key={m.id}>
            <a className="athumb" href={m.url} target="_blank" rel="noopener" aria-label={`Open ${m.name}`}>
              {m.type.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element -- R2 file
                <img src={m.url} alt="" loading="lazy" />
              ) : (
                <AIcon d={m.type.startsWith('video/') ? IC.video : IC.file} size={28} w={1.8} />
              )}
            </a>
            <b>{m.name}</b>
            <span className="amrow">
              <span className="ghost">
                {m.uses.length ? m.uses.join(', ') : 'Not used yet'} · {sizeLabel(m.size)}
              </span>
              {m.uses.length ? null : (
                <button className="alink" type="button" onClick={() => void remove(m)}>
                  Delete
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      {toast}
    </div>
  );
}
