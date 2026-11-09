import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { DevLoginForm } from '@/components/admin/DevLoginForm';
import { currentAdmin, usesAccess } from '@/lib/admin/auth';
import { hostKind } from '@/lib/host';

import '@/components/admin/admin.css';

export const metadata: Metadata = { title: 'RelaxPump Admin — Sign in', robots: { index: false } };
export const dynamic = 'force-dynamic';

/**
 * AdminLogin.dc.html. Only for local development: in production Cloudflare Access shows its
 * own email one-time-PIN screen before the request ever reaches the Worker.
 */
export default async function AdminLogin() {
  if ((await hostKind()) === 'site') notFound();
  if (await currentAdmin()) redirect('/admin');
  if (await usesAccess()) redirect('/admin');
  return (
    <div className="lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative */}
      <img src="/hero-water.jpg" alt="" />
      <div className="lfade" />
      <DevLoginForm />
    </div>
  );
}
