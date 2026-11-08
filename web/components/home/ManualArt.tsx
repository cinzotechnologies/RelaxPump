// Page drawings and page faces for the install manual book (Main.dc.html, PG pages).
import { LogoMark, Wordmark } from '@/components/ui/Logo';
import type { DotColor, ManualIll, ManualPage } from '@/lib/content/home';
import { app, art, shade, theme } from '@/styles/tokens';

const DOT: Record<DotColor, string> = {
  teal2: theme.teal2,
  teal: theme.teal,
  glow: theme.glow,
  aqua: shade.aqua,
  warning: theme.warning,
  wireBrown: art.wireBrown,
  wireBrownWhite: art.wireBrownWhite,
  wireBlue: art.wireBlue,
  wireGreen: art.wireGreen,
};

export function Illustration({ ill }: { ill: ManualIll }) {
  switch (ill) {
    case 'box':
      return (
        <svg width="190" height="130" viewBox="0 0 200 130" aria-hidden>
          <path
            d="M30 46l70-24 70 24v56l-70 18-70-18z"
            fill={theme.tint2}
            stroke={theme.teal2}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M30 46l70 18 70-18 M100 64v56" fill="none" stroke={theme.teal2} strokeWidth="2.5" />
          <rect x="72" y="74" width="20" height="13" rx="3" fill={theme.teal} />
        </svg>
      );
    case 'tank':
      return (
        <svg width="190" height="150" viewBox="0 0 200 150" aria-hidden>
          <rect
            x="36"
            y="36"
            width="114"
            height="104"
            rx="18"
            fill={theme.white}
            stroke={shade.sage}
            strokeWidth="2.5"
          />
          <path
            d="M39 84q14-6 28 0t28 0t28 0t24 0V126a12 12 0 0 1-12 12H51a12 12 0 0 1-12-12z"
            fill={theme.glow}
          />
          <rect x="78" y="22" width="30" height="16" rx="4" fill={theme.teal} />
          <path d="M93 40v40" stroke={theme.teal2} strokeWidth="2" strokeDasharray="4 4" />
          <path
            d="M164 38v44 M158 38h12 M158 82h12"
            stroke={theme.warning}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <text x="160" y="104" fontFamily="Inter" fontSize="13" fontWeight="700" fill={art.amberText}>
            30 cm
          </text>
        </svg>
      );
    case 'valve':
      return (
        <svg width="190" height="120" viewBox="0 0 200 120" aria-hidden>
          <rect x="8" y="72" width="184" height="22" rx="11" fill={art.pipe} />
          <rect x="72" y="58" width="56" height="48" rx="11" fill={theme.teal} />
          <rect x="80" y="14" width="40" height="46" rx="10" fill={theme.ink} />
          <circle cx="100" cy="82" r="9" fill={theme.glow} />
          <text x="130" y="36" fontFamily="Inter" fontSize="13" fontWeight="700" fill={theme.teal}>
            12 V
          </text>
        </svg>
      );
    case 'shield':
      return (
        <svg width="170" height="140" viewBox="0 0 200 140" aria-hidden>
          <path
            d="M100 10l52 18v34c0 32-22 50-52 60-30-10-52-28-52-60V28z"
            fill={theme.tint2}
            stroke={theme.teal2}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M78 66l16 16 30-34"
            fill="none"
            stroke={theme.teal}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'pump':
      return (
        <svg width="190" height="120" viewBox="0 0 200 120" aria-hidden>
          <rect
            x="12"
            y="20"
            width="66"
            height="80"
            rx="12"
            fill={theme.white}
            stroke={shade.sage}
            strokeWidth="2.5"
          />
          <rect x="24" y="36" width="17" height="24" rx="4" fill={theme.teal} />
          <rect x="48" y="36" width="17" height="24" rx="4" fill={theme.teal} />
          <path d="M78 60h38" stroke={theme.warning} strokeWidth="3" strokeDasharray="5 4" />
          <rect x="116" y="34" width="72" height="54" rx="12" fill={theme.teal} />
          <circle cx="142" cy="61" r="15" fill={art.deep} />
          <path d="M142 50v22 M131 61h22" stroke={theme.glow} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'phone':
      return (
        <svg width="170" height="140" viewBox="0 0 200 140" aria-hidden>
          <rect x="68" y="6" width="64" height="128" rx="14" fill={theme.ink} />
          <rect x="75" y="18" width="50" height="104" rx="8" fill={app.appCard} />
          <rect x="85" y="36" width="30" height="30" rx="4" fill={theme.white} />
          <path d="M89 40h9v9h-9z M102 40h9v9h-9z M89 53h9v9h-9z M104 55h5v5h-5z" fill={theme.ink} />
          <rect x="82" y="86" width="36" height="13" rx="6.5" fill={theme.glow} />
          <path
            d="M28 60a32 32 0 0 1 32-32 M38 60a22 22 0 0 1 22-22 M172 60a32 32 0 0 0-32-32 M162 60a22 22 0 0 0-22-22"
            fill="none"
            stroke={theme.teal2}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

const Engineered = () => (
  <span className="eng">
    Engineered by <b>CINZO</b>
  </span>
);

/** One page face. `side` = L (left of spine) or R; `n` = printed page number. */
export function PageFace({ pg, side, n }: { pg: ManualPage; side: 'L' | 'R'; n: string }) {
  const dark = pg.kind === 'coverL' || pg.kind === 'end' || pg.kind === 'back';
  return (
    <div className={`pg ${side}${dark ? ' dark' : ''}`}>
      {pg.kind === 'coverL' ? (
        <div className="pgc">
          <span className="cover-wm">
            <Wordmark />
          </span>
          <span className="cover-rule" />
          <Engineered />
        </div>
      ) : pg.kind === 'title' ? (
        <div className="pgc">
          <LogoMark size={58} />
          <span className="pk">Version 1.0</span>
          <span className="pt" style={{ fontSize: 40 }}>
            Install manual
          </span>
          <span style={{ fontSize: 15, color: 'var(--muted)' }}>Read before you install.</span>
        </div>
      ) : pg.kind === 'end' ? (
        <div className="pgc">
          <span className="pt" style={{ fontSize: 34, color: 'var(--white)' }}>
            Enjoy tanks that
            <br />
            fill themselves.
          </span>
          <Engineered />
        </div>
      ) : pg.kind === 'back' ? (
        <div className="pgc center">
          <LogoMark size={58} />
          <span style={{ fontSize: 14, color: 'var(--on-dark)' }}>
            Chhinlung Zofa Technologies Private Limited
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--glow)' }}>cinzotechnologies.com</span>
        </div>
      ) : (
        <div className={`pgx${pg.ill ? ' two' : ''}`}>
          <div className="pgt">
            <span className="pk">{pg.k}</span>
            <span className="pt">{pg.t}</span>
            <div className="lns">
              {pg.lines.map((l) => (
                <div className="ln" key={l.t}>
                  <span className="dt" style={{ background: DOT[l.c ?? 'teal2'] }} />
                  <span>{l.t}</span>
                </div>
              ))}
            </div>
          </div>
          {pg.ill ? (
            <div className="pgi">
              <Illustration ill={pg.ill} />
            </div>
          ) : null}
        </div>
      )}
      <span className="pn">{n}</span>
    </div>
  );
}
