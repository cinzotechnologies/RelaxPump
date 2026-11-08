import Link from 'next/link';

import { Check } from '@/components/ui/icons';
import type { HomeContent } from '@/lib/content/home';

/** 16:9 hero: photo at the bottom with a slow zoom, white fade from top and left, copy on the left. */
export function Hero({ c }: { c: HomeContent['hero'] }) {
  return (
    <section className="hero" id="top">
      {/* eslint-disable-next-line @next/next/no-img-element -- R2/media URL, no optimizer on Workers */}
      <img className="hbg" src={c.imageUrl} alt="Water drop splashing on calm water" fetchPriority="high" />
      <div className="hfade" />
      <div className="wrap hcopy">
        <h1 className="h1 in d1">
          {c.titleA}
          <br />
          <em>{c.titleB}</em>
        </h1>
        <p className="hsub in d2">{c.sub}</p>
        <div className="hero-ctas in d3">
          <a className="hb" href="#download">
            {c.ctaApp}
          </a>
          <Link className="hb" href="/store">
            {c.ctaKit}
          </Link>
        </div>
        <div className="hchecks in d4">
          {c.checks.map((t) => (
            <span key={t}>
              <Check />
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
