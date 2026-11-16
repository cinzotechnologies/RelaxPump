// Store → Plan your kit (reference/website/Shop.dc.html, docs/two-module-system.md §7):
// "What do you have?" Pump + tanks | PHE lines | Both → result cards, pump options and the kit list.
// Pure, unit tested (tests/unit/kit.test.ts). Pump figures are estimates from typical pump curves.

export type Module = 'hh' | 'phe' | 'both';

export type KitInput = {
  mod: Module;
  /** Household semi tanks 1–5. */
  tanks: number;
  /** Litres per tank. */
  litres: number;
  /** Height of the highest tank in feet. */
  height: number;
  /** Main tank underground (suction lift) or at ground level. */
  under: boolean;
  /** Depth of an underground main tank in feet. */
  depth: number;
  /** Pipe size in inches. */
  pipe: number;
  /** Sensor in the main tank (Main Tank Kit). */
  main: boolean;
  /** PHE lines 1–5. */
  lines: number;
  /** Pump the visitor tapped ("1 HP"), else the best one is used. */
  pick?: string;
};

export const DEFAULT_KIT: KitInput = {
  mod: 'hh',
  tanks: 3,
  litres: 1000,
  height: 30,
  under: false,
  depth: 8,
  pipe: 1,
  main: false,
  lines: 2,
};

export const MAX_TANKS = 5;
export const MAX_LINES = 5;
export const LITRE_OPTS = [500, 1000, 1500, 2000];

/** Typical open-well pumps: max flow q (L/min), shut-off head h (m), contactor size. */
export const PUMPS = [
  { hp: '0.5 HP', q: 40, h: 25, ct: '9 A' },
  { hp: '1 HP', q: 60, h: 35, ct: '12 A' },
  { hp: '1.5 HP', q: 90, h: 40, ct: '18 A' },
  { hp: '2 HP', q: 120, h: 45, ct: '25 A' },
] as const;
export type Pump = (typeof PUMPS)[number];

/** Pipe sizes and the flow they carry well (L/min). */
export const PIPES = [
  { v: 0.5, label: '½"', cap: 21 },
  { v: 0.75, label: '¾"', cap: 38 },
  { v: 1, label: '1"', cap: 59 },
  { v: 1.25, label: '1¼"', cap: 96 },
] as const;

/** "45 min" / "1 h 5 min" */
export function fmtMin(m: number): string {
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

export type PumpOpt = {
  hp: string;
  tag: 'Best' | 'Good' | 'Slow' | 'Very slow' | 'Too weak';
  line: string;
  sub: string;
  /** Cannot reach the height with a margin: not selectable. */
  off: boolean;
  selected: boolean;
};

export type KitLine = { id: string; name: string; note: string; q: number };

export type KitResult = {
  hasHH: boolean;
  hasPhe: boolean;
  /** Lift in metres: height + 20 % pipe losses + suction. */
  head: number;
  pump: Pump | null;
  /** The visitor's pick differs from the best one. */
  picked: boolean;
  warn: string;
  flow: number;
  oneMin: number;
  allMin: number;
  pumpOpts: PumpOpt[];
  pipeTip: string;
  kit: KitLine[];
};

export function planKit(c: KitInput): KitResult {
  const pipe = PIPES.find((x) => x.v === c.pipe) ?? PIPES[2];
  const depthM = c.under ? c.depth / 3.28 : 0;
  const head = Math.round(((c.height / 3.28) * 1.2 + (c.under ? depthM : 0.5)) * 10) / 10;
  const flowOf = (x: Pump) => Math.min(x.q * (1 - head / x.h), pipe.cap);
  const ok = PUMPS.filter((x) => x.h * 0.75 >= head);
  const best = ok.find((x) => flowOf(x) >= Math.min(25, pipe.cap * 0.9)) ?? ok[ok.length - 1] ?? null;
  const pickedPump = PUMPS.find((x) => x.hp === c.pick && x.h * 0.75 >= head) ?? null;
  const pump = pickedPump ?? best;

  let warn = '';
  if (c.under && depthM > 6)
    warn =
      'The main tank is deeper than 6 m (20 ft). A surface pump cannot lift from there — use a submersible pump. Call us to plan it.';
  else if (!pump)
    warn =
      'This is higher than a 2 HP pump lifts well. You need a high-head or booster pump — call us to plan it.';

  const flow = pump ? Math.max(5, Math.round(Math.min(pump.q * (1 - head / pump.h), pipe.cap))) : 0;
  const oneMin = flow ? Math.round(c.litres / flow) : 0;
  const allMin = flow ? c.tanks * oneMin + (c.tanks - 1) : 0;

  const pumpOpts: PumpOpt[] = PUMPS.map((x) => {
    const works = x.h * 0.75 >= head;
    const lifts = x.h > head * 1.05;
    const f = lifts ? Math.max(1, Math.round(Math.min(x.q * (1 - head / x.h), pipe.cap))) : 0;
    const one = f ? Math.round(c.litres / f) : 0;
    const all = f ? c.tanks * one + (c.tanks - 1) : 0;
    const isBest = !warn && !!best && x.hp === best.hp;
    const tag: PumpOpt['tag'] = !lifts
      ? 'Too weak'
      : !works
        ? 'Very slow'
        : isBest
          ? 'Best'
          : f >= Math.min(25, pipe.cap * 0.9)
            ? 'Good'
            : 'Slow';
    return {
      hp: x.hp,
      tag,
      line: lifts ? `${f} L/min · one tank ${fmtMin(one)}` : `Cannot lift to ${c.height} ft`,
      sub: lifts
        ? `All tanks ${fmtMin(all)} · contactor ${x.ct}`
        : `Max lift ${x.h} m, you need about ${head} m`,
      off: !works,
      selected: !!pump && x.hp === pump.hp,
    };
  });

  const nextPipe = PIPES[PIPES.indexOf(pipe) + 1];
  let pipeTip = '';
  if (pump && !warn && nextPipe && Math.min(pump.q * (1 - head / pump.h), pipe.cap) >= pipe.cap - 0.5) {
    const f2 = Math.round(Math.min(pump.q * (1 - head / pump.h), nextPipe.cap));
    if (f2 > flow)
      pipeTip = `Your ${pipe.label} pipe is the limit. With a ${nextPipe.label} pipe this pump gives about ${f2} L/min — one tank in ${fmtMin(Math.round(c.litres / f2))}.`;
  }

  const hasHH = c.mod !== 'phe';
  const hasPhe = c.mod !== 'hh';
  const kit: KitLine[] = [];
  if (hasHH) {
    kit.push({ id: 'kit', name: 'Household Controller', note: 'Pump + semi tanks', q: 1 });
    kit.push(
      c.tanks === 1
        ? { id: 'sensor', name: 'Level Sensor', note: 'One tank needs no valve', q: 1 }
        : { id: 'tank', name: 'Tank Kit', note: 'Sensor + valve for each tank', q: c.tanks },
    );
    if (c.main) kit.push({ id: 'main', name: 'Main Tank Kit', note: 'Sensor for the main tank', q: 1 });
    kit.push({
      id: 'pump',
      name: 'Pump Kit',
      note: pump ? `Contactor ${pump.ct} for a ${pump.hp} pump` : 'We size it with you',
      q: 1,
    });
  }
  if (hasPhe) {
    kit.push({ id: 'phectrl', name: 'PHE Controller', note: 'PHE lines, no pump', q: 1 });
    kit.push({ id: 'phe', name: 'PHE Line Kit', note: 'Sensor + valve for each PHE line', q: c.lines });
  }

  return {
    hasHH,
    hasPhe,
    head,
    pump,
    picked: !!pickedPump && !!best && pickedPump.hp !== best.hp,
    warn,
    flow,
    oneMin,
    allMin,
    pumpOpts,
    pipeTip,
    kit,
  };
}
