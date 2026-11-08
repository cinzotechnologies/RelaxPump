'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AppScreen } from '@/components/app-screen/AppScreen';
import { ArrowLeft, ArrowRight } from '@/components/ui/icons';
import type { HomeContent } from '@/lib/content/home';

const AUTO_MS = 6000;

/** "How it works": 4 slides, auto-advance every 6 s; a click resets the timer. */
export function Features({ c }: { c: HomeContent['how'] }) {
  const n = c.feats.length;
  const [cur, setCur] = useState({ feat: 0, prev: -1 });
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const go = useCallback((i: number) => {
    setCur((s) => (i === s.feat ? s : { feat: i, prev: s.feat }));
  }, []);

  const startAuto = useCallback(() => {
    clearInterval(timer.current);
    timer.current = setInterval(() => setCur((s) => ({ feat: (s.feat + 1) % n, prev: s.feat })), AUTO_MS);
  }, [n]);

  useEffect(() => {
    startAuto();
    return () => clearInterval(timer.current);
  }, [startAuto]);

  const pick = (i: number) => {
    if (i === cur.feat) return;
    go(i);
    startAuto();
  };
  const cls = (i: number) => (i === cur.feat ? 'on' : i === cur.prev ? 'was' : '');

  return (
    <section className="feat" id="how">
      <div className="wrap">
        <div className="fhead rv">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
            <span className="kicker">{c.kicker}</span>
            <h2 className="h2">{c.title}</h2>
          </div>
          <div className="arrows">
            <button
              className="ic"
              type="button"
              aria-label="Previous"
              onClick={() => pick((cur.feat + n - 1) % n)}
            >
              <ArrowLeft />
            </button>
            <button className="ic" type="button" aria-label="Next" onClick={() => pick((cur.feat + 1) % n)}>
              <ArrowRight />
            </button>
          </div>
        </div>
        <div className="fstage">
          <div>
            <div className="ftext" aria-live="polite">
              {c.feats.map((f, i) => (
                <div className={`ft ${cls(i)}`} key={f.n} aria-hidden={i !== cur.feat}>
                  <span className="fnum">
                    {f.n} / {String(n).padStart(2, '0')}
                  </span>
                  <h3>{f.t}</h3>
                  <p className="sub">{f.d}</p>
                </div>
              ))}
            </div>
            <div className="ftabs" role="tablist" aria-label="How it works">
              {c.feats.map((f, i) => (
                <button
                  key={f.n}
                  className={`tab ${i === cur.feat ? 'on' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={i === cur.feat}
                  onClick={() => pick(i)}
                >
                  <span className="pbar">
                    {/* new key per activation restarts the 6 s progress animation */}
                    <i key={i === cur.feat ? `on-${cur.feat}-${cur.prev}` : 'off'} />
                  </span>
                  {f.k}
                </button>
              ))}
            </div>
          </div>
          <div className="fpanel">
            {c.feats.map((f, i) => (
              <div className={`fbg t${f.tone} ${cls(i)}`} key={f.n}>
                <span className="fbig">{f.n}</span>
              </div>
            ))}
            {c.feats.map((f, i) => (
              <div className={`fph ${cls(i)}`} key={f.n}>
                <AppScreen screen={f.screen} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
