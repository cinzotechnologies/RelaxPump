import { AppScreen } from '@/components/app-screen/AppScreen';
import type { HomeContent } from '@/lib/content/home';

/** Teal card with store badges ("SOON" until the apps are live) and two tilted phones. */
export function Download({ c }: { c: HomeContent['download'] }) {
  return (
    <section className="dl" id="download">
      <div className="wrap">
        <div className="dlcard rv">
          <span className="ring" style={{ width: 520, height: 520, right: -140, top: -160 }} />
          <span className="ring" style={{ width: 760, height: 760, right: -260, top: -280 }} />
          <div className="dlcopy">
            <span className="kicker">{c.kicker}</span>
            <h2 className="h2">{c.title}</h2>
            <div className="badges">
              <a
                className="badge"
                href={c.playUrl}
                aria-label={c.playLive ? 'Get it on Google Play' : 'Get it on Google Play (coming soon)'}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M5 3.2v17.6c0 .5.5.8.9.6l15-8.8c.4-.3.4-.9 0-1.2l-15-8.8c-.4-.2-.9.1-.9.6z"
                    fill="currentColor"
                  />
                </svg>
                <span>
                  <small>GET IT ON</small>
                  <b>Google Play</b>
                </span>
                {c.playLive ? null : <span className="soon">SOON</span>}
              </a>
              <a
                className="badge"
                href={c.appStoreUrl}
                aria-label={
                  c.appStoreLive ? 'Download on the App Store' : 'Download on the App Store (coming soon)'
                }
              >
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <rect x="6" y="2.5" width="12" height="19" rx="3" />
                  <path d="M11 18h2" />
                </svg>
                <span>
                  <small>Download on the</small>
                  <b>App Store</b>
                </span>
                {c.appStoreLive ? null : <span className="soon">SOON</span>}
              </a>
            </div>
          </div>
          <div className="dlph" aria-hidden>
            <div className="a">
              <AppScreen screen="welcome" />
            </div>
            <div className="b">
              <AppScreen screen="home" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
