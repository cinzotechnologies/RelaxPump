import Link from 'next/link';

import { AdminTop } from '@/components/admin/Sidebar';
import { AIcon, IC, ago, initials, phoneFmt } from '@/components/admin/icons';
import { currentAdmin } from '@/lib/admin/auth';
import { resetRequests, setting, whenLabel } from '@/lib/admin/data';
import { SECTIONS } from '@/lib/content/sections';

export const dynamic = 'force-dynamic';

const QUICK = [
  { label: 'Hero text and image', icon: IC.hero, sec: 'hero' },
  { label: 'Install video', icon: IC.video, sec: 'guide' },
  { label: 'App store links', icon: IC.dl, sec: 'download' },
  { label: 'Contact info', icon: IC.mail, sec: 'contact' },
];

export default async function Dashboard() {
  const admin = await currentAdmin();
  const [waiting, lastPub, ordering] = await Promise.all([
    resetRequests('waiting'),
    setting('last_published'),
    setting('ordering_open'),
  ]);
  const first = admin?.name === 'CINZO Admin' ? 'CINZO' : (admin?.name ?? '');
  return (
    <>
      <AdminTop title="Dashboard">
        <a className="abtn" href="/" target="_blank" rel="noopener">
          View website
        </a>
      </AdminTop>
      <div className="abody">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h2 style={{ fontSize: 28 }}>Hello, {first}</h2>
          <span className="lbl">Here is what needs you today.</span>
        </div>
        <div className="stats">
          <div className="card stat">
            <span className="aico">
              <AIcon d={IC.key} />
            </span>
            <b>{waiting.length}</b>
            <span className="lbl">Password requests waiting</span>
          </div>
          <div className="card stat">
            <span className="aico">
              <AIcon d={IC.site} />
            </span>
            <b>{SECTIONS.length}</b>
            <span className="lbl">Website sections</span>
          </div>
          <div className="card stat">
            <span className="aico">
              <AIcon d={IC.check} />
            </span>
            <b className="sm">{whenLabel(lastPub ? Number(lastPub) : null)}</b>
            <span className="lbl">Last published</span>
          </div>
          <div className="card stat">
            <span className="aico">
              <AIcon d={IC.cartFull} />
            </span>
            <b className="sm">{ordering === 'true' ? 'Open' : 'Closed'}</b>
            <span className="lbl">Online ordering</span>
          </div>
        </div>
        <div className="g2">
          <div className="card">
            <div className="ch">
              <h2>Forgot password requests</h2>
              <Link className="abtn" href="/admin/requests">
                Open all
              </Link>
            </div>
            {waiting.length === 0 ? <p className="empty-note">All done. No one is waiting.</p> : null}
            {waiting.slice(0, 3).map((r) => (
              <Link className="row" key={r.id} href={`/admin/requests?id=${r.id}`}>
                <span className="av">{initials(r.name)}</span>
                <span className="rn">
                  <b>{r.name}</b>
                  <span>
                    +91 {phoneFmt(r.phone)} · {ago(r.createdAt)}
                  </span>
                </span>
                <span className="pillst pend">Waiting</span>
              </Link>
            ))}
          </div>
          <div className="card">
            <div className="ch">
              <h2>Quick edit</h2>
            </div>
            <div className="qgrid">
              {QUICK.map((q) => (
                <Link className="qt" key={q.sec} href={`/admin/website?sec=${q.sec}`}>
                  <span className="aico">
                    <AIcon d={q.icon} size={18} />
                  </span>
                  {q.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
