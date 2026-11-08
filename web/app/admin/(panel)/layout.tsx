import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/admin/Sidebar';
import { currentAdmin, usesAccess } from '@/lib/admin/auth';
import { waitingCount } from '@/lib/admin/data';

import '@/components/admin/admin.css';

export const metadata: Metadata = { title: 'RelaxPump Admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** Admin shell. Every page and /api/admin route re-checks the admin; this is the first gate. */
export default async function PanelLayout({ children }: LayoutProps<'/admin'>) {
  const admin = await currentAdmin();
  if (!admin) {
    if (!(await usesAccess())) redirect('/admin/login');
    return (
      <div className="adm" style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
        <div className="card" style={{ padding: 28, maxWidth: 420 }}>
          <h1 style={{ fontSize: 24 }}>No access</h1>
          <p className="lbl" style={{ marginTop: 10 }}>
            This email is not on the admin list. Ask CINZO to add you.
          </p>
        </div>
      </div>
    );
  }
  const waiting = await waitingCount().catch(() => 0);
  return (
    <div className="adm">
      <div className="shell">
        <Sidebar waiting={waiting} email={admin.email} name={admin.name} />
        <div className="amain">{children}</div>
      </div>
    </div>
  );
}
