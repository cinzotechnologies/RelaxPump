// Phone mockups of the RelaxPump app, used on the home page (reference/website/AppScreen.dc.html).
// Pure markup, no state: safe as a server component.
import { useId } from 'react';

import { LogoMark } from '@/components/ui/Logo';
import { app, theme } from '@/styles/tokens';

import './app-screen.css';

export type ScreenKey = 'welcome' | 'home' | 'tanks' | 'usage' | 'ble' | 'account';

const TANKS = [
  { name: 'Roof', pct: 82, litres: '820 / 1,000 L' },
  { name: 'Kitchen', pct: 46, litres: '230 / 500 L' },
  { name: 'Garden', pct: 18, litres: '90 / 500 L' },
];
const BARS = [420, 610, 520, 700, 480, 560, 570];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const PER = [
  { name: 'Roof', l: '1,940 L', w: '78%' },
  { name: 'Kitchen', l: '1,210 L', w: '50%' },
  { name: 'Garden', l: '710 L', w: '30%' },
];

const s = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const I = {
  power: <path d="M12 3v8 M6.3 7.3a8 8 0 1 0 11.4 0" />,
  auto: <path d="M20 12a8 8 0 1 1-2.3-5.7 M20 4v4h-4" />,
  tank: (
    <path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3z M5 6c0 1.7 3.1 3 7 3s7-1.3 7-3" />
  ),
  usage: <path d="M5 20V10 M12 20V4 M19 20v-7" />,
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  ble: <path d="M7 7l10 10-5 4V3l5 4L7 17" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bell: <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0" />,
  wifi: <path d="M2 9a15 15 0 0 1 20 0 M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5h.01" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chev: <path d="M9 6l6 6-6 6" />,
};
const Ico = ({ d, size = 18, w = 2 }: { d: React.ReactNode; size?: number; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={w} aria-hidden {...s}>
    {d}
  </svg>
);

function Welcome() {
  // Unique ids: several phones show this screen on one page.
  const id = useId().replace(/:/g, '');
  return (
    <div className="as-fill as-welcome">
      <div className="as-halo" />
      <svg width="132" height="160" viewBox="0 0 132 160" aria-hidden style={{ position: 'relative' }}>
        <defs>
          <clipPath id={`wtc${id}`}>
            <rect x="20" y="22" width="92" height="118" rx="20" />
          </clipPath>
          <linearGradient id={`wtg${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={theme.glow} />
            <stop offset="1" stopColor={theme.teal2} />
          </linearGradient>
        </defs>
        <rect
          x="16"
          y="18"
          width="100"
          height="126"
          rx="24"
          fill={theme.glow}
          fillOpacity="0.08"
          stroke={theme.glow}
          strokeOpacity="0.45"
          strokeWidth="2"
        />
        <rect x="50" y="8" width="32" height="12" rx="5" fill={theme.glow} fillOpacity="0.35" />
        <g clipPath={`url(#wtc${id})`}>
          <path d="M0 70q16-8 33 0t33 0t33 0t33 0V160H0z" fill={theme.glowSoft} opacity="0.35" />
          <path d="M0 76q16-9 33 0t33 0t33 0t33 0V160H0z" fill={`url(#wtg${id})`} />
        </g>
        <path
          d="M40 100q4-3 8 0"
          fill="none"
          stroke={theme.white}
          strokeOpacity="0.6"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <div className="as-wm as-outfit">
        <span className="r">Relax</span>
        <span className="p">Pump</span>
      </div>
      <div className="as-muted" style={{ marginTop: 8, fontSize: 13 }}>
        Tanks that fill themselves.
      </div>
      <div className="as-cta">
        Get started
        <span className="as-go">
          <Ico d={I.arrow} w={2.2} />
        </span>
      </div>
      <div className="as-eng">
        <i />
        Engineered by <b>CINZO</b>
        <i />
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className="as-fill">
      <div className="as-head">
        <div className="as-tile">
          <LogoMark size={26} />
        </div>
        <div className="as-hello">
          <small>Welcome back</small>
          <b>Rina</b>
        </div>
        <div className="as-bell">
          <Ico d={I.bell} size={17} />
          <i />
        </div>
        <div className="as-av">
          <span>RK</span>
        </div>
      </div>
      <div className="as-level">
        <svg width="254" height="128" viewBox="0 0 254 128" aria-hidden>
          <path d="M0 50q21-9 42 0t42 0t42 0t42 0t42 0t42 0V128H0z" fill={app.appWaveBack} />
          <path d="M0 56q21-9 42 0t42 0t42 0t42 0t42 0t42 0V128H0z" fill={app.appWaveFront} />
        </svg>
        <div className="as-level-in">
          <small>Average level</small>
          <span className="as-big">64%</span>
          <span className="as-status">
            <span className="as-led" />
            Filling Tank 2<span className="as-tag">Start 30%</span>
            <span className="as-tag">Stop 95%</span>
          </span>
        </div>
      </div>
      <div className="as-acts">
        <div className="as-act on">
          <Ico d={I.power} w={2.2} />
          Pump
        </div>
        <div className="as-act">
          <Ico d={I.auto} />
          Auto
        </div>
        <div className="as-act">
          <Ico d={I.tank} />
          Tanks
        </div>
        <div className="as-act">
          <Ico d={I.usage} w={2.2} />
          Usage
        </div>
      </div>
      <div className="as-list">
        {TANKS.map((t) => (
          <div className="as-row" key={t.name}>
            <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
              <circle
                cx="17"
                cy="17"
                r="14"
                fill="none"
                stroke={theme.glow}
                strokeOpacity="0.14"
                strokeWidth="4"
              />
              <circle
                cx="17"
                cy="17"
                r="14"
                fill="none"
                stroke={t.pct < 25 ? theme.warning : theme.glow}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${(t.pct * 0.88).toFixed(1)} 88`}
                transform="rotate(-90 17 17)"
              />
            </svg>
            <span className="as-row-t">
              <b>{t.name}</b>
              <small>{t.litres}</small>
            </span>
            <span className="as-pct">{t.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Tanks() {
  return (
    <div className="as-fill as-page as-tanks">
      <div className="as-between">
        <span className="as-title">Tanks</span>
        <span className="as-edit">Edit</span>
      </div>
      <div className="as-cards">
        {TANKS.map((t, i) => (
          <div className="as-tc" key={t.name}>
            <small>{t.name}</small>
            <div className="as-tank">
              <div className={`w${t.pct < 25 ? ' low' : ''}`} style={{ height: `${t.pct}%` }} />
              <div className="hi" />
              <div className="lo" />
            </div>
            <span className="as-pct">{t.pct}%</span>
            <span className={`as-valve${i === 1 ? ' open' : ''}`}>{i === 1 ? 'Open' : 'Closed'}</span>
          </div>
        ))}
      </div>
      <div className="as-auto">
        <div className="as-between">
          <span>Auto mode</span>
          <span className="as-sw">
            <i />
          </span>
        </div>
        <div className="as-lbl">
          <span>Start below</span>
          <b>30%</b>
        </div>
        <div className="as-slider">
          <div className="v" style={{ width: '33%' }} />
          <span className="k" style={{ left: '30%' }} />
        </div>
        <div className="as-lbl">
          <span>Stop at</span>
          <b>95%</b>
        </div>
        <div className="as-slider">
          <div className="v" style={{ width: '94%' }} />
          <span className="k" style={{ left: '88%' }} />
        </div>
      </div>
      <div className="as-cta">
        <Ico d={I.power} size={16} w={2.4} />
        Stop pump
      </div>
    </div>
  );
}

function Usage() {
  return (
    <div className="as-fill as-page">
      <span className="as-title">Usage</span>
      <div className="as-seg">
        <span className="on">Water</span>
        <span>Pump</span>
      </div>
      <div className="as-box">
        <small>Last 7 days</small>
        <div className="as-big">3,860 L</div>
        <div className="as-bars">
          {BARS.map((v, i) => (
            <div key={i}>
              <i className={i === 6 ? 'on' : ''} style={{ height: Math.round(v / 7) }} />
              <small>{DAYS[i]}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="as-per">
        {PER.map((p) => (
          <div key={p.name}>
            <span className="as-lbl">
              <span>{p.name}</span>
              <b>{p.l}</b>
            </span>
            <div className="t">
              <i style={{ width: p.w }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ble() {
  return (
    <div className="as-fill as-ble">
      <div className="as-orb">
        <span>
          <Ico d={I.ble} size={34} w={2.2} />
        </span>
      </div>
      <div className="as-sheet">
        <div className="as-grab" />
        <h4>Bluetooth setup</h4>
        <p>Found your controller. Pick your Wi-Fi.</p>
        <div className="as-dev">
          <span className="bi">
            <Ico d={I.ble} size={16} />
          </span>
          <b>RelaxPump-3F2A</b>
          <small>Found</small>
        </div>
        <div className="as-wifi sel">
          <Ico d={I.wifi} size={16} />
          <span>Home_WiFi</span>
          <small>Strong</small>
        </div>
        <div className="as-wifi">
          <Ico d={I.wifi} size={16} />
          <span>Office-2G</span>
          <small>Good</small>
        </div>
        <div className="as-pw">••••••••••</div>
        <div className="as-cta">Connect</div>
      </div>
    </div>
  );
}

const ROWS = [
  { t: 'Change password', d: 'M5 11h14v9H5z M8 11V8a4 4 0 0 1 8 0v3' },
  { t: 'Your tanks', d: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3z' },
  { t: 'Notifications', d: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z' },
  { t: 'Sign out', d: 'M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10', danger: true },
];

function Account() {
  return (
    <div className="as-fill as-account">
      <div className="as-av-lg">
        <span>RK</span>
      </div>
      <div className="as-name">Rina Khiangte</div>
      <div className="as-phone">+91 98765 43210</div>
      <div className="as-menu">
        {ROWS.map((r) => (
          <div className={`as-mrow${r.danger ? ' danger' : ''}`} key={r.t}>
            <i>
              <Ico d={<path d={r.d} />} size={15} />
            </i>
            <span>{r.t}</span>
            <Ico d={I.chev} size={14} />
          </div>
        ))}
      </div>
      <div className="as-ver">
        RelaxPump 1.0 · Engineered by <b>CINZO</b>
      </div>
    </div>
  );
}

function Nav({ screen }: { screen: ScreenKey }) {
  const on = (k: ScreenKey) => (screen === k ? 'on' : undefined);
  return (
    <div className="as-nav">
      <span className={on('home')}>
        <Ico d={I.home} size={20} />
      </span>
      <span className={on('tanks')}>
        <Ico d={I.tank} size={20} />
      </span>
      <div className="as-ble-btn">
        <Ico d={I.ble} size={22} />
      </div>
      <span className={on('usage')}>
        <Ico d={I.usage} size={20} w={2.2} />
      </span>
      <span>
        <Ico d={I.plus} size={20} w={2.2} />
      </span>
    </div>
  );
}

const BODY: Record<ScreenKey, () => React.ReactElement> = {
  welcome: Welcome,
  home: Home,
  tanks: Tanks,
  usage: Usage,
  ble: Ble,
  account: Account,
};

/** One 300 × 620 phone showing an app screen. */
export function AppScreen({ screen }: { screen: ScreenKey }) {
  const Body = BODY[screen];
  const nav = screen === 'home' || screen === 'tanks' || screen === 'usage' || screen === 'account';
  return (
    <div className="as" aria-hidden>
      <div className="as-screen">
        <div className="as-notch" />
        <Body />
        {nav ? <Nav screen={screen} /> : null}
      </div>
    </div>
  );
}
