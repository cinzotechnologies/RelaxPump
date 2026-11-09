import type { Metadata } from 'next';
import Link from 'next/link';

import { DeleteAccountForm } from '@/components/site/DeleteAccountForm';
import { Footer } from '@/components/site/Footer';
import { TopBar } from '@/components/site/TopBar';
import { getSite } from '@/lib/content/load';

import '@/components/site/legal.css';

export const metadata: Metadata = {
  title: 'Delete your account — RelaxPump',
  description: 'Delete your RelaxPump account and its data.',
};
export const dynamic = 'force-dynamic';

export default async function DeleteAccountPage() {
  const { contact: c } = await getSite();
  return (
    <>
      <TopBar />
      <main className="legal">
        <div className="wrap">
          <article className="legal-card">
            <h1>Delete your RelaxPump account</h1>
            <p>
              You can also do this in the app: <b>Account › Delete account</b>.
            </p>
            <p>Deleting your account removes, right away:</p>
            <ul>
              <li>your name, mobile number and sign-in,</li>
              <li>your profile and the phones registered for notifications,</li>
              <li>the link to your controller (it can then be set up again by anyone with the box code).</li>
            </ul>
            <p>
              Readings stored on the controller itself (levels, events, daily totals) stay with the controller
              and are removed automatically after 30 days (events) and 1 year (totals). See the{' '}
              <Link href="/privacy">privacy policy</Link>.
            </p>
            <div className="note">This cannot be undone.</div>
            <DeleteAccountForm />
            <p className="updated">
              Forgot your password? Use <b>Forgot password</b> in the app first, or contact us at{' '}
              <a href={`tel:${c.phoneTel}`}>{c.phone}</a> / <a href={`mailto:${c.email}`}>{c.email}</a>.
            </p>
          </article>
        </div>
      </main>
      <Footer c={c} />
    </>
  );
}
