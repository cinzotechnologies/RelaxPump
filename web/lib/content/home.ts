// Home page copy (seed). The design's text is the default; D1 `content` overrides it from W5.
import type { ScreenKey } from '@/components/app-screen/AppScreen';

export type Feature = { n: string; k: string; t: string; d: string; screen: ScreenKey; tone: 1 | 2 | 3 | 4 };
export type Shot = { key: ScreenKey; label: string; d: string };
/** Dot colour = a token name (styles/tokens.ts). */
export type DotColor =
  'teal2' | 'teal' | 'glow' | 'aqua' | 'warning' | 'wireBrown' | 'wireBrownWhite' | 'wireBlue' | 'wireGreen';
export type ManualLine = { t: string; c?: DotColor };
export type ManualIll = 'box' | 'tank' | 'valve' | 'shield' | 'pump' | 'phone';
export type ManualPage =
  | { kind: 'coverL' }
  | { kind: 'title' }
  | { kind: 'end' }
  | { kind: 'back' }
  | { kind: 'text'; k: string; t: string; lines: ManualLine[]; ill?: ManualIll };

export type HomeContent = {
  hero: {
    titleA: string;
    titleB: string;
    sub: string;
    ctaApp: string;
    ctaKit: string;
    checks: string[];
    imageUrl: string;
  };
  how: { kicker: string; title: string; feats: Feature[] };
  gallery: { kicker: string; title: string; shots: Shot[] };
  guide: { kicker: string; title: string; chapters: string[]; videoUrl: string | null; posterUrl: string };
  manual: { kicker: string; title: string; pdfUrl: string | null; pages: ManualPage[] };
  download: {
    kicker: string;
    title: string;
    playUrl: string;
    appStoreUrl: string;
    playLive: boolean;
    appStoreLive: boolean;
  };
  store: { kicker: string; title: string; badge: string };
};

const L = (arr: string[], cols?: (DotColor | undefined)[]): ManualLine[] =>
  arr.map((t, i) => (cols?.[i] ? { t, c: cols[i] } : { t }));

export const DEFAULT_HOME: HomeContent = {
  hero: {
    titleA: 'Smart water tank',
    titleB: 'automation',
    sub: 'See every tank and run your pump from your phone — by hand or fully automatic.',
    ctaApp: 'Get the app',
    ctaKit: 'Order the kit',
    checks: ['Up to 3 tanks', 'Works anywhere', 'Dry-run safe'],
    imageUrl: '/hero-water.jpg',
  },
  how: {
    kicker: 'How it works',
    title: 'Every tank, handled.',
    feats: [
      {
        n: '01',
        k: 'Levels',
        t: 'Live levels',
        d: 'Every tank on your phone, anywhere.',
        screen: 'home',
        tone: 1,
      },
      {
        n: '02',
        k: 'Auto',
        t: 'Auto fill',
        d: 'Set start and stop. It does the rest.',
        screen: 'tanks',
        tone: 2,
      },
      {
        n: '03',
        k: 'Alerts',
        t: 'Usage & alerts',
        d: 'Litres, pump time, and dry-run alerts.',
        screen: 'usage',
        tone: 3,
      },
      { n: '04', k: 'Setup', t: '1-minute setup', d: 'Scan, connect Wi-Fi, done.', screen: 'ble', tone: 4 },
    ],
  },
  gallery: {
    kicker: 'App screens',
    title: 'The app',
    shots: [
      { key: 'welcome', label: 'Welcome', d: 'A calm start — your tanks, one tap away.' },
      { key: 'home', label: 'Home', d: 'Average level, pump status and every tank at a glance.' },
      { key: 'tanks', label: 'Tanks', d: 'Valves, live fills and auto start/stop levels.' },
      { key: 'usage', label: 'Usage', d: 'Litres and pump minutes for the last 7 days.' },
      { key: 'ble', label: 'Bluetooth setup', d: 'First-time setup: send your Wi-Fi to the controller.' },
      { key: 'account', label: 'Account', d: 'Profile, password, tanks and sign out.' },
    ],
  },
  guide: {
    kicker: 'Install guide',
    title: 'Watch, then install',
    chapters: ['Unboxing', 'Mount the sensors', 'Fit the valves', 'Wire the pump', 'Set up in the app'],
    videoUrl: null,
    posterUrl: '/hero-water.jpg',
  },
  manual: {
    kicker: 'Manual',
    title: 'The install manual',
    pdfUrl: null,
    pages: [
      { kind: 'coverL' },
      { kind: 'title' },
      {
        kind: 'text',
        k: 'Start here',
        t: 'In the box',
        lines: L([
          'ESP32 controller',
          'Ultrasonic sensor — one per tank',
          '12 V solenoid valve — one per tank',
          'Relay module + pump contactor',
          '5 V power supply',
        ]),
        ill: 'box',
      },
      {
        kind: 'text',
        k: 'Before you start',
        t: 'Stay safe',
        lines: L(
          [
            'Switch off the pump at the MCB.',
            'Pump wiring must be done by an electrician.',
            'Keep your Wi-Fi password ready.',
          ],
          ['warning', 'warning'],
        ),
      },
      {
        kind: 'text',
        k: 'Step 1',
        t: 'Mount the sensors',
        lines: L(['Fix the probe on the tank lid.', 'Keep it at least 30 cm above the full level.']),
        ill: 'tank',
      },
      {
        kind: 'text',
        k: 'Step 1 · cable',
        t: 'One cable per tank',
        lines: L(
          ['Brown — 5 V', 'Brown-white — GND', 'Blue — Trig', 'Green — Echo'],
          ['wireBrown', 'wireBrownWhite', 'wireBlue', 'wireGreen'],
        ),
      },
      {
        kind: 'text',
        k: 'Step 2',
        t: 'Fit the valves',
        lines: L(['One 12 V solenoid valve on each tank inlet.', 'Relay IN1–IN3 switch valves 1–3.']),
        ill: 'valve',
      },
      {
        kind: 'text',
        k: 'Step 3',
        t: 'Wire the pump',
        lines: L(
          ['Relay IN4 drives the contactor coil.', 'Use an MCB on the pump line.', 'Electrician only.'],
          [undefined, undefined, 'warning'],
        ),
        ill: 'pump',
      },
      {
        kind: 'text',
        k: 'Step 4',
        t: 'Power on',
        lines: L(
          [
            'Slow blink — waiting for setup',
            'Fast blink — connecting',
            'Steady — online',
            'Double blink — safety stop',
          ],
          ['glow', 'aqua', 'teal', 'warning'],
        ),
      },
      {
        kind: 'text',
        k: 'Step 5',
        t: 'Set up in the app',
        lines: L([
          '1. Sign up with your phone number.',
          '2. Scan the QR on the box.',
          '3. Pick your Wi-Fi and connect.',
          '4. Set your tank sizes.',
        ]),
        ill: 'phone',
      },
      {
        kind: 'text',
        k: 'Built in',
        t: 'Safety',
        lines: L([
          'Valve opens 2 s before the pump.',
          'Stops on a dry run.',
          'Max run time — 30 min.',
          '60 s rest before restart.',
        ]),
        ill: 'shield',
      },
      {
        kind: 'text',
        k: 'Help',
        t: 'Need help?',
        lines: L([
          'New router? Hold BOOT 5 s, then set up again.',
          'Call +91 98632 62589',
          'cinzotechnologies@gmail.com',
          'Chala Road, Luangmual',
        ]),
      },
      { kind: 'end' },
      { kind: 'back' },
    ],
  },
  download: {
    kicker: 'Download',
    title: 'Get the app',
    playUrl: 'https://play.google.com/store/apps/details?id=com.cinzo.relaxpump',
    appStoreUrl: '/#download',
    playLive: false,
    appStoreLive: false,
  },
  store: {
    kicker: 'RelaxPump Store',
    title: 'Order the kit',
    badge: 'Coming soon',
  },
};
