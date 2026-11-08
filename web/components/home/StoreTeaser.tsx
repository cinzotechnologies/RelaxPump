'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ArrowRight } from '@/components/ui/icons';
import type { HomeContent } from '@/lib/content/home';
import { type Product, priceLabel } from '@/lib/content/products';

import { ProductArt } from './ProductArt';

/** Three product cards, "Notify me" toggles, and a link to the store. */
export function StoreTeaser({ c, products }: { c: HomeContent['store']; products: Product[] }) {
  const [notified, setNotified] = useState<Record<string, boolean>>({});
  return (
    <section className="store" id="store">
      <div className="wrap">
        <div className="fhead rv">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
            <span className="kicker">{c.kicker}</span>
            <h2 className="h2">{c.title}</h2>
          </div>
          <span className="eyebrow soon">{c.badge}</span>
        </div>
        <div className="pgrid">
          {products.slice(0, 3).map((p) => {
            const on = !!notified[p.id];
            return (
              <article className="pc rv" key={p.id}>
                <div className="pimg">
                  <span className="ptag">{p.tag}</span>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- R2 media
                    <img src={p.imageUrl} alt={p.name} loading="lazy" />
                  ) : (
                    <ProductArt art={p.art} />
                  )}
                </div>
                <div className="pbody">
                  <h3>{p.name}</h3>
                  <div className="pfoot">
                    <span className="pprice">{priceLabel(p) ?? 'Price soon'}</span>
                    <button
                      className={on ? 'btn nb on' : 'btn nb'}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setNotified((s) => ({ ...s, [p.id]: !on }))}
                    >
                      {on ? 'We will tell you' : 'Notify me'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="store-more">
          <Link className="btn" href="/store">
            Open the store
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  );
}
