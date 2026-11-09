'use client';

import { useState } from 'react';

import { youtubeId } from '@/lib/content/youtube';

import { AIcon, IC } from './icons';

export type MediaItem = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  createdAt: number;
  uses: string[];
};

/** Upload one file to the media library, with progress (0–100). */
export function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/media');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const body = xhr.response as { item?: MediaItem; error?: string } | null;
      if (xhr.status === 201 && body?.item) resolve(body.item);
      else reject(new Error(body?.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed — check the connection'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

export const ACCEPT = {
  image: 'image/jpeg,image/png,image/webp,image/avif,image/gif',
  video: 'video/mp4,video/webm',
  file: 'application/pdf',
} as const;

/** "/media/2026/11/ab12cd34-hero.jpg" → "hero.jpg" */
export function fileNameOf(url: string): string {
  const last = decodeURIComponent(url.split('/').pop() ?? url);
  return last.replace(/^[0-9a-f]{8}-/, '');
}

export function Switch({
  on,
  label,
  onChange,
  wide,
}: {
  on: boolean;
  label: string;
  onChange: (v: boolean) => void;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'atgl wide' : 'atgl'}>
      <span>{label}</span>
      <button
        className={on ? 'asw on' : 'asw'}
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={on}
        onClick={() => onChange(!on)}
      >
        <i />
      </button>
    </div>
  );
}

/** Image / video / PDF field: preview, Upload, Remove; videos also take a YouTube link. */
export function MediaField({
  kind,
  label,
  value,
  onChange,
  onError,
  emptyName,
}: {
  kind: 'image' | 'video' | 'file';
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  onError: (msg: string) => void;
  emptyName?: string;
}) {
  const [pct, setPct] = useState<number | null>(null);
  const yt = kind === 'video' && value ? youtubeId(value) : null;
  const uploaded = !!value && !yt;
  const [link, setLink] = useState(yt ? (value ?? '') : '');
  const [linkErr, setLinkErr] = useState('');

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setPct(0);
    try {
      const item = await uploadFile(f, setPct);
      setLink('');
      onChange(item.url);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setPct(null);
    }
  }

  const name =
    pct !== null
      ? `Uploading… ${pct}%`
      : yt
        ? 'YouTube video'
        : value
          ? fileNameOf(value)
          : (emptyName ?? 'Nothing uploaded');

  return (
    <div className="afld wide">
      <span>{label}</span>
      <div className="amedia">
        <span className="athumb">
          {kind === 'image' && value ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview of an R2 file
            <img src={value} alt="" />
          ) : yt ? (
            // eslint-disable-next-line @next/next/no-img-element -- YouTube thumbnail
            <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" />
          ) : (
            <AIcon
              d={kind === 'image' ? IC.media : kind === 'video' ? IC.video : IC.file}
              size={28}
              w={1.8}
            />
          )}
          {pct !== null ? <span className="abar" style={{ width: `${pct}%` }} /> : null}
        </span>
        <span className="amcol">
          <span className="amname">{name}</span>
          <span className="amrow">
            <label className="abtn sm" aria-disabled={pct !== null}>
              Upload
              <input type="file" accept={ACCEPT[kind]} onChange={pick} disabled={pct !== null} />
            </label>
            {value ? (
              <button className="abtn sm" type="button" onClick={() => (setLink(''), onChange(null))}>
                Remove
              </button>
            ) : null}
            {uploaded && kind === 'file' ? (
              <a className="abtn sm" href={value} target="_blank" rel="noopener">
                Open
              </a>
            ) : null}
          </span>
          {kind === 'video' ? (
            <>
              <input
                className="ainp"
                type="url"
                aria-label="YouTube link"
                placeholder="Or paste a YouTube link"
                value={link}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  setLink(e.target.value);
                  if (!v) {
                    setLinkErr('');
                    if (yt) onChange(null);
                  } else if (youtubeId(v)) {
                    setLinkErr('');
                    onChange(v);
                  } else setLinkErr('That is not a YouTube link');
                }}
              />
              {linkErr ? <span className="aerr">{linkErr}</span> : null}
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}
