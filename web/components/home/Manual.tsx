'use client';

import { useState } from 'react';

import { ArrowLeft, ArrowRight } from '@/components/ui/icons';
import type { HomeContent } from '@/lib/content/home';

import { PageFace } from './ManualArt';

/**
 * The install manual as a real book. Desktop: leaves turn around the spine
 * (rotateY(-180deg), backface hidden); click the right page to go on, the left to go back.
 * Phone: one page at a time, the page peels away to the left.
 */
export function Manual({ c }: { c: HomeContent['manual'] }) {
  const PG = c.pages;
  const NM = PG.length; // pages
  const NL = Math.floor((NM - 2) / 2); // leaves between the two covers
  const last = NM - 2; // last numbered page index
  const num = (i: number) => (i >= 2 && i <= last - 1 ? String(i - 1) : '');
  const numbered = Math.max(0, last - 2);

  const [bk, setBk] = useState(0); // leaves turned
  const [lastLeaf, setLastLeaf] = useState(-1);
  const [mp, setMp] = useState(0); // phone: current page

  const turn = (i: number, turned: boolean) => {
    setBk(turned ? i : i + 1);
    setLastLeaf(i);
  };
  const prev = () => {
    setBk((b) => Math.max(0, b - 1));
    setLastLeaf(Math.max(0, bk - 1));
    setMp((m) => Math.max(0, m - 1));
  };
  const next = () => {
    setBk((b) => Math.min(NL, b + 1));
    setLastLeaf(Math.min(NL - 1, bk));
    setMp((m) => Math.min(NM - 1, m + 1));
  };
  const pairLabel = bk === 0 ? 'Cover' : bk === NL ? 'End' : `Pages ${2 * bk - 1}–${2 * bk} of ${numbered}`;

  return (
    <section className="manual" id="manual">
      <div className="wrap">
        <div className="fhead rv">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="kicker">{c.kicker}</span>
            <h2 className="h2">{c.title}</h2>
          </div>
          {c.pdfUrl ? (
            <a className="btn" href={c.pdfUrl} download>
              Download PDF
            </a>
          ) : (
            <a className="btn" href="#manual">
              Download PDF — soon
            </a>
          )}
        </div>
      </div>
      <div className="bkw">
        <div className="board" />
        <div className="dbook">
          <div className="base bl">
            <PageFace pg={PG[0]} side="L" n="" />
          </div>
          <div className="base br">
            <PageFace pg={PG[NM - 1]} side="R" n="" />
          </div>
          {Array.from({ length: NL }, (_, i) => {
            const turned = i < bk;
            return (
              <button
                key={i}
                className={`leaf${turned ? ' turned' : ''}`}
                type="button"
                style={{ zIndex: i === lastLeaf ? 60 : turned ? 10 + i : 10 + NL - i }}
                aria-label={turned ? 'Turn back' : 'Turn page'}
                onClick={() => turn(i, turned)}
              >
                <div className="face f">
                  <PageFace pg={PG[2 * i + 1]} side="R" n={num(2 * i + 1)} />
                </div>
                <div className="face b">
                  <PageFace pg={PG[2 * i + 2]} side="L" n={num(2 * i + 2)} />
                </div>
              </button>
            );
          })}
        </div>
        <div className="mbook">
          {PG.map((pg, i) => (
            <button
              key={i}
              className={`mleaf${i < mp ? ' turned' : ''}`}
              type="button"
              style={{ zIndex: NM - i }}
              aria-label="Next page"
              tabIndex={i === mp ? 0 : -1}
              onClick={() => setMp(Math.min(NM - 1, i + 1))}
            >
              <PageFace pg={pg} side="R" n={num(i)} />
            </button>
          ))}
        </div>
      </div>
      <div className="bnav">
        <button className="ic" type="button" aria-label="Previous page" onClick={prev}>
          <ArrowLeft />
        </button>
        <span className="bcount" aria-live="polite">
          <span className="donly">{pairLabel}</span>
          <span className="monly">
            {mp + 1} / {NM}
          </span>
        </span>
        <button className="ic" type="button" aria-label="Next page" onClick={next}>
          <ArrowRight />
        </button>
      </div>
    </section>
  );
}
