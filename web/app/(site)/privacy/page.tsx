import type { Metadata } from 'next';
import Link from 'next/link';

import { Footer } from '@/components/site/Footer';
import { TopBar } from '@/components/site/TopBar';
import { getSite } from '@/lib/content/load';

import '@/components/site/legal.css';

export const metadata: Metadata = {
  title: 'Privacy policy — RelaxPump',
  description: 'How the RelaxPump app and website use your data.',
};
export const dynamic = 'force-dynamic';

const UPDATED = '9 November 2026';

export default async function PrivacyPage() {
  const { contact: c } = await getSite();
  return (
    <>
      <TopBar />
      <main className="legal">
        <div className="wrap">
          <article className="legal-card">
            <h1>Privacy policy</h1>
            <p className="updated">Last updated: {UPDATED}</p>
            <p>
              This policy explains what the <b>RelaxPump</b> app, the RelaxPump controller and this website
              collect, why, and what you can do about it. RelaxPump is made by {c.company}{' '}
              (&ldquo;CINZO&rdquo;, &ldquo;we&rdquo;).
            </p>

            <h2>What we collect</h2>
            <ul>
              <li>
                <b>Account:</b> your name, mobile number and password. The password is stored only as a secure
                hash by Google Firebase Authentication; we never see it.
              </li>
              <li>
                <b>Your controller and tanks:</b> tank levels, pump on/off, valve state, tank names and sizes,
                start/stop levels, events (for example &ldquo;tank full&rdquo; or &ldquo;dry run&rdquo;) and
                daily water / pump-time totals.
              </li>
              <li>
                <b>Notifications:</b> a push token for each phone where you are signed in, so we can send
                alerts.
              </li>
              <li>
                <b>Forgot password requests:</b> the name and number you type, the time and your IP address
                (to stop abuse).
              </li>
              <li>
                <b>Orders</b> (when online ordering is open): name, phone, delivery address and the items you
                choose.
              </li>
            </ul>
            <p>
              We do not collect your location, contacts, photos or files. The camera is used only to scan the
              code on the controller box, and Bluetooth only to send your Wi-Fi details to the controller
              during setup; neither is stored. We do not show ads, do not use advertising or analytics
              trackers, and do not sell or share your data with anyone for marketing.
            </p>

            <h2>Why we use it</h2>
            <ul>
              <li>To sign you in and keep your controller linked to your account.</li>
              <li>To show your tanks, run the pump automatically and keep it safe.</li>
              <li>To send you alerts you asked for.</li>
              <li>To reset your password when you ask, and to deliver orders.</li>
            </ul>

            <h2>Where it is stored</h2>
            <p>
              Account and tank data are stored with <b>Google Firebase</b> (Authentication, Realtime Database
              in the Asia–Southeast region, Cloud Messaging for notifications). The website, password requests
              and orders are stored with <b>Cloudflare</b>. Both protect data in transit with encryption. Only
              CINZO staff can open the admin panel, and only you (signed in) can read or control your tanks.
            </p>

            <h2>How long we keep it</h2>
            <ul>
              <li>Events: 30 days. Daily totals: up to 1 year.</li>
              <li>Forgot password requests: up to 6 months after they are handled.</li>
              <li>Your account and tank data: until you delete your account.</li>
            </ul>

            <h2>Delete your account</h2>
            <p>
              In the app: <b>Account › Delete account</b>. Or on the web:{' '}
              <Link href="/delete-account">delete your account</Link>. This removes your profile and push
              tokens, releases your controller so it can be set up again, and deletes your sign-in. It cannot
              be undone.
            </p>

            <h2>Children</h2>
            <p>RelaxPump is meant for home owners and is not directed at children under 13.</p>

            <h2>Changes</h2>
            <p>If this policy changes, we update this page and the date above.</p>

            <h2>Contact</h2>
            <p>
              {c.company}, {c.address}
              <br />
              Phone: <a href={`tel:${c.phoneTel}`}>{c.phone}</a> · Email:{' '}
              <a href={`mailto:${c.email}`}>{c.email}</a>
            </p>
          </article>
        </div>
      </main>
      <Footer c={c} />
    </>
  );
}
