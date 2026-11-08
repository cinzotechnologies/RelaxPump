'use client';

import { useState } from 'react';

import { AppScreen } from '@/components/app-screen/AppScreen';
import { ArrowLeft, ArrowRight } from '@/components/ui/icons';
import type { HomeContent } from '@/lib/content/home';

const POS: Record<string, string> = { '-2': 'pm2', '-1': 'pm1', '0': 'p0', '1': 'p1', '2': 'p2' };

/** Coverflow of the app screens, looped, with chips and arrows. */
export function Gallery({ c }: { c: HomeContent['gallery'] }) {
  const n = c.shots.length;
  const [shot, setShot] = useState(1);
  const pos = (i: number) => POS[String(((i - shot + n + 3) % n) - 3)] ?? 'ph';

  return (
    <section className="gal" id="app">
      <div className="wrap" style={{ textAlign: 'center' }}>
        <div className="gal-head rv">
          <span className="kicker">{c.kicker}</span>
          <h2 className="h2">{c.title}</h2>
        </div>
        <div className="chips" role="tablist" aria-label="App screens">
          {c.shots.map((s, i) => (
            <button
              key={s.key}
              className={`chip ${i === shot ? 'on' : ''}`}
              type="button"
              role="tab"
              aria-selected={i === shot}
              onClick={() => setShot(i)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="cf">
        {c.shots.map((s, i) => (
          <button
            key={s.key}
            className={`cfc ${pos(i)}`}
            type="button"
            aria-label={`${s.label} screen`}
            tabIndex={pos(i) === 'ph' ? -1 : 0}
            onClick={() => setShot(i)}
          >
            <span className="sh" />
            <AppScreen screen={s.key} />
          </button>
        ))}
      </div>
      <div className="wrap cap">
        <div className="cap-t" aria-live="polite">
          {c.shots[shot].label}
        </div>
        <div className="arrows">
          <button
            className="ic"
            type="button"
            aria-label="Previous screen"
            onClick={() => setShot((shot + n - 1) % n)}
          >
            <ArrowLeft />
          </button>
          <button
            className="ic"
            type="button"
            aria-label="Next screen"
            onClick={() => setShot((shot + 1) % n)}
          >
            <ArrowRight />
          </button>
        </div>
      </div>
    </section>
  );
}
