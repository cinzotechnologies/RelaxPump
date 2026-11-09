import { ago, whenLabel } from '@/components/admin/icons';
import { type RequestRow, RequestsView } from '@/components/admin/RequestsView';
import { AdminTop } from '@/components/admin/Sidebar';
import { resetRequests, type ResetRow } from '@/lib/admin/data';
import { siteUrl } from '@/lib/host';

export const dynamic = 'force-dynamic';

const toRow = (r: ResetRow): RequestRow => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  status: r.status,
  when: ago(r.createdAt),
  doneLabel:
    r.status === 'done' ? `Done${r.handledBy ? ` by ${r.handledBy}` : ''} · ${whenLabel(r.handledAt)}` : null,
});

export default async function RequestsPage({ searchParams }: PageProps<'/admin/requests'>) {
  const [waiting, done, sp] = await Promise.all([
    resetRequests('waiting'),
    resetRequests('done', 50),
    searchParams,
  ]);
  return (
    <>
      <AdminTop title="Password requests">
        <a className="abtn" href={(await siteUrl()) || '/'} target="_blank" rel="noopener">
          View website
        </a>
      </AdminTop>
      <div className="abody">
        <RequestsView
          waiting={waiting.map(toRow)}
          done={done.map(toRow)}
          startId={typeof sp.id === 'string' ? sp.id : null}
        />
      </div>
    </>
  );
}
