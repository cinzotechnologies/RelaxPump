'use client';

import { useEffect, useRef, useState } from 'react';

import { Play } from '@/components/ui/icons';
import type { HomeContent } from '@/lib/content/home';

/** YouTube watch/short/embed URL → embed URL, else null. */
export function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0` : null;
}

/** Install video: 16:9 player with chapters. Until a video exists, play says "Video coming soon". */
export function Guide({ c }: { c: HomeContent['guide'] }) {
  const [ch, setCh] = useState(0);
  const [toast, setToast] = useState(false);
  const [playing, setPlaying] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);

  const n = c.chapters.length;
  const yt = c.videoUrl ? youtubeEmbed(c.videoUrl) : null;
  const hasVideo = !!c.videoUrl;

  const play = () => {
    if (hasVideo) {
      setPlaying(true);
      return;
    }
    setToast(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => setToast(false), 1800);
  };

  return (
    <section className="guide" id="guide">
      <div className="wrap">
        <div className="fhead rv">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="kicker">{c.kicker}</span>
            <h2 className="h2">{c.title}</h2>
          </div>
        </div>
        <div className="vid">
          <div className="player">
            {playing && c.videoUrl ? (
              yt ? (
                <iframe
                  src={yt}
                  title="Install video"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <video src={c.videoUrl} poster={c.posterUrl} controls autoPlay playsInline />
              )
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- poster from R2 */}
                <img src={c.posterUrl} alt="" loading="lazy" />
                <div className="pshade" />
                <div className="ptop">
                  <span className="pchip">
                    Chapter {ch + 1} of {n}
                  </span>
                  {hasVideo ? null : <span className="soonc">VIDEO SOON</span>}
                </div>
                <button className="play" type="button" aria-label="Play video" onClick={play}>
                  <Play />
                </button>
                {toast ? (
                  <span className="vtoast" role="status">
                    Video coming soon
                  </span>
                ) : null}
                <div className="pbot">
                  <span className="ptitle">{c.chapters[ch]}</span>
                  <div className="segs">
                    {c.chapters.map((_, i) => (
                      <span key={i} className={`seg ${i <= ch ? 'on' : ''}`} />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="chs" role="list">
            {c.chapters.map((title, i) => (
              <button
                key={title}
                className={`chb ${i === ch ? 'on' : ''}`}
                type="button"
                aria-pressed={i === ch}
                onClick={() => {
                  setCh(i);
                  setToast(false);
                }}
              >
                <span className="chn">{String(i + 1).padStart(2, '0')}</span>
                <span>{title}</span>
                {hasVideo ? null : <span className="chs-s">Soon</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
