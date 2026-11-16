'use client';
// Store → Plan your kit (reference/website/Shop.dc.html #plan, docs/two-module-system.md §7):
// "What do you have?" Pump + tanks | PHE lines | Both, then the household questions (tanks, size,
// height, main tank, pipe, main sensor) or the PHE lines; results, pump options and the kit list,
// which goes into the cart in one tap. Maths: lib/kit.ts.
import { useState } from 'react';

import type { Contact } from '@/lib/content/contact';
import {
  DEFAULT_KIT,
  fmtMin,
  LITRE_OPTS,
  MAX_LINES,
  MAX_TANKS,
  PIPES,
  planKit,
  type KitInput,
  type Module,
} from '@/lib/kit';

import { useCart } from './cart';

import './plan.css';

const MODS: { v: Module; label: string }[] = [
  { v: 'hh', label: 'Pump + tanks' },
  { v: 'phe', label: 'PHE lines' },
  { v: 'both', label: 'Both' },
];

const TAG_CLS: Record<string, string> = {
  Best: 't-best',
  Good: 't-ok',
  'Too weak': 't-no',
  Slow: 't-slow',
  'Very slow': 't-slow',
};

function Opts<T>({
  items,
  value,
  onPick,
  label,
}: {
  items: { v: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  label: string;
}) {
  return (
    <div className="opts" role="group" aria-label={label}>
      {items.map((o) => (
        <button
          key={o.label}
          className={o.v === value ? 'opt on' : 'opt'}
          type="button"
          aria-pressed={o.v === value}
          onClick={() => onPick(o.v)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Count({
  n,
  max,
  onSet,
  what,
}: {
  n: number;
  max: number;
  onSet: (n: number) => void;
  what: string;
}) {
  return (
    <div className="step" style={{ alignSelf: 'flex-start' }}>
      <button type="button" aria-label={`One less ${what}`} onClick={() => onSet(Math.max(1, n - 1))}>
        −
      </button>
      <span aria-live="polite">{n}</span>
      <button type="button" aria-label={`One more ${what}`} onClick={() => onSet(Math.min(max, n + 1))}>
        +
      </button>
    </div>
  );
}

export function PlanKit({ contact, ids }: { contact: Contact; ids: string[] }) {
  const { clear, setQty, setOpen } = useCart();
  const [c, setC] = useState<KitInput>(DEFAULT_KIT);
  const set = (p: Partial<KitInput>) => setC((x) => ({ ...x, ...p }));
  const r = planKit(c);
  const addKit = () => {
    clear();
    for (const k of r.kit) if (ids.includes(k.id)) setQty(k.id, k.q);
    setOpen(true);
  };

  return (
    <section className="plan" id="plan">
      <div className="wrap">
        <span className="kicker">Plan your kit</span>
        <h2 className="plan-h">What do you need?</h2>
        <div className="caps">
          <div className="cap">
            <b>5</b>
            <span>semi tanks on the Household controller</span>
          </div>
          <div className="cap">
            <b>5</b>
            <span>PHE lines on the PHE controller</span>
          </div>
          <div className="cap">
            <b>1 + 1</b>
            <span>sensor and valve for each tank or line</span>
          </div>
          <div className="cap">
            <b>1 app</b>
            <span>for both — buy one or both</span>
          </div>
        </div>
        <div className="calc">
          <div className="cbox">
            <div className="q">
              <span className="ql">What do you have?</span>
              <Opts items={MODS} value={c.mod} onPick={(mod) => set({ mod })} label="What do you have?" />
            </div>
            {r.hasPhe ? (
              <div className="q">
                <span className="ql">
                  PHE lines<b>{c.lines}</b>
                </span>
                <Count n={c.lines} max={MAX_LINES} onSet={(lines) => set({ lines })} what="PHE line" />
              </div>
            ) : null}
            {r.hasHH ? (
              <>
                <div className="q">
                  <span className="ql">
                    Semi tanks<b>{c.tanks}</b>
                  </span>
                  <Count n={c.tanks} max={MAX_TANKS} onSet={(tanks) => set({ tanks })} what="tank" />
                </div>
                <div className="q">
                  <span className="ql">Size of each tank</span>
                  <Opts
                    items={LITRE_OPTS.map((l) => ({ v: l, label: `${l.toLocaleString('en-IN')} L` }))}
                    value={c.litres}
                    onPick={(litres) => set({ litres })}
                    label="Size of each tank"
                  />
                </div>
                <div className="q">
                  <label className="ql" htmlFor="hgt">
                    Height of the highest tank<b>{c.height} ft</b>
                  </label>
                  <input
                    className="rng"
                    id="hgt"
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={c.height}
                    onChange={(e) => set({ height: Number(e.target.value) })}
                  />
                </div>
                <div className="q">
                  <span className="ql">Main tank</span>
                  <Opts
                    items={[
                      { v: false, label: 'At ground level' },
                      { v: true, label: 'Underground' },
                    ]}
                    value={c.under}
                    onPick={(under) => set({ under })}
                    label="Main tank"
                  />
                  {c.under ? (
                    <>
                      <label className="ql" htmlFor="dep" style={{ fontWeight: 500 }}>
                        How deep<b>{c.depth} ft</b>
                      </label>
                      <input
                        className="rng"
                        id="dep"
                        type="range"
                        min={2}
                        max={40}
                        step={1}
                        value={c.depth}
                        onChange={(e) => set({ depth: Number(e.target.value) })}
                      />
                    </>
                  ) : null}
                </div>
                <div className="q">
                  <span className="ql">Pipe size</span>
                  <Opts
                    items={PIPES.map((p) => ({ v: p.v as number, label: p.label }))}
                    value={c.pipe}
                    onPick={(pipe) => set({ pipe })}
                    label="Pipe size"
                  />
                </div>
                <div className="tgl">
                  <span>Sensor in the main tank</span>
                  <button
                    className={c.main ? 'sw on' : 'sw'}
                    type="button"
                    aria-label="Sensor in the main tank"
                    aria-pressed={c.main}
                    onClick={() => set({ main: !c.main })}
                  >
                    <i />
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <div className="cbox res" aria-live="polite">
            {!r.hasHH ? (
              <>
                <div className="rbig">
                  <div className="rcard">
                    <span>PHE lines</span>
                    <b>{c.lines}</b>
                    <small>sensor + valve each</small>
                  </div>
                  <div className="rcard">
                    <span>Pump</span>
                    <b>None</b>
                    <small>PHE pressure fills the tanks</small>
                  </div>
                </div>
                <div className="warn">
                  PHE pressure is low. Our PHE valves are zero-pressure 12 V solenoids, and they close by
                  themselves in a power cut.
                </div>
              </>
            ) : (
              <>
                <div className="rbig">
                  <div className="rcard">
                    <span>Pump</span>
                    <b>{r.warn ? 'Call us' : r.pump?.hp}</b>
                    <small>
                      {r.warn ? 'Special pump needed' : r.picked ? 'your choice' : 'best for you'}
                    </small>
                  </div>
                  <div className="rcard">
                    <span>Lift</span>
                    <b>{r.head} m</b>
                    <small>height + pipe losses</small>
                  </div>
                  <div className="rcard">
                    <span>One tank fills in</span>
                    <b>{r.warn ? '—' : fmtMin(r.oneMin)}</b>
                    <small>about {r.flow} L/min</small>
                  </div>
                  <div className="rcard">
                    <span>All tanks, from empty</span>
                    <b>{r.warn ? '—' : fmtMin(r.allMin)}</b>
                    <small>one tank at a time</small>
                  </div>
                </div>
                {r.warn ? <div className="warn">{r.warn}</div> : null}
                <span className="ql" style={{ marginTop: 2 }}>
                  Your pump options
                </span>
                <div className="popts">
                  {r.pumpOpts.map((o) => (
                    <button
                      key={o.hp}
                      className={o.selected ? 'po on' : 'po'}
                      type="button"
                      disabled={o.off}
                      aria-pressed={o.selected}
                      onClick={() => set({ pick: o.hp })}
                    >
                      <span className="hp">{o.hp}</span>
                      <span className="pd">
                        <b>{o.line}</b>
                        <span>{o.sub}</span>
                      </span>
                      <span className={`tagx ${TAG_CLS[o.tag]}`}>{o.tag}</span>
                    </button>
                  ))}
                </div>
                {r.pipeTip ? <p className="fine tip">{r.pipeTip}</p> : null}
              </>
            )}
            <div className="klist">
              {r.kit.map((k) => (
                <div className="kr" key={k.id}>
                  <span className="kn">
                    <b>{k.name}</b>
                    <span className="fine">{k.note}</span>
                  </span>
                  <span className="kq">× {k.q}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-p" type="button" onClick={addKit} style={{ width: '100%' }}>
              Add this kit to cart
            </button>
            <p className="fine">
              Pump figures are estimates from typical pump curves. Check the head and flow on your pump label,
              or call <a href={`tel:${contact.phoneTel}`}>{contact.phone}</a>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
