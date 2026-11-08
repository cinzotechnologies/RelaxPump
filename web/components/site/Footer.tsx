import Link from 'next/link';

import { Globe, Mail, Phone, Pin } from '@/components/ui/icons';
import { LogoMark, Wordmark } from '@/components/ui/Logo';
import type { Contact } from '@/lib/content/contact';

/**
 * Dark footer with company, contact, product links and the "Developed by CINZO" bar.
 * `variant="store"` (Shop.dc.html): wordmark only, no call button, no Product column.
 */
export function Footer({ c, variant = 'home' }: { c: Contact; variant?: 'home' | 'store' }) {
  const store = variant === 'store';
  const year = new Date().getFullYear();
  return (
    <footer className={store ? 'foot foot-store' : 'foot'} id="contact">
      <div className="wrap">
        <div className="fgrid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: store ? 16 : 18 }}>
            <div className="fbrand">
              {store ? null : (
                <span className="tile">
                  <LogoMark />
                </span>
              )}
              <Wordmark />
            </div>
            <p className="fcompany">{c.company}</p>
            {store ? null : (
              <a className="btn" href={`tel:${c.phoneTel}`}>
                Call us now
              </a>
            )}
          </div>
          <div className="fl">
            <span className="fh">Contact</span>
            <a className="ci" href={`tel:${c.phoneTel}`}>
              <span className="i">
                <Phone />
              </span>
              <span>{c.phone}</span>
            </a>
            <a className="ci" href={`mailto:${c.email}`}>
              <span className="i">
                <Mail />
              </span>
              <span style={{ wordBreak: 'break-all' }}>{c.email}</span>
            </a>
            <div className="ci">
              <span className="i">
                <Pin />
              </span>
              <span>{c.address}</span>
            </div>
            <a className="ci" href={`https://${c.website}`}>
              <span className="i">
                <Globe />
              </span>
              <span>{c.website}</span>
            </a>
          </div>
          {store ? null : (
            <div className="fl">
              <span className="fh">Product</span>
              <Link href="/#how">How it works</Link>
              <Link href="/#app">App screens</Link>
              <Link href="/#guide">Install video</Link>
              <Link href="/#manual">Manual</Link>
              <Link href="/#download">Download the app</Link>
              <Link href="/store">Store</Link>
            </div>
          )}
          <div className="fl">
            <span className="fh">App</span>
            <a href={c.playUrl}>Google Play</a>
            <a href={c.appStoreUrl}>App Store</a>
          </div>
        </div>
        <div className="fbar">
          <span>
            © {year} {c.company}
          </span>
          <span>
            Developed by <b>CINZO</b>
          </span>
        </div>
      </div>
    </footer>
  );
}
