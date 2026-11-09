import { MediaLibrary } from '@/components/admin/MediaLibrary';
import { AdminTop } from '@/components/admin/Sidebar';
import { listMedia } from '@/lib/admin/media';
import { siteUrl } from '@/lib/host';

export const dynamic = 'force-dynamic';

export default async function MediaPage() {
  const items = await listMedia();
  return (
    <>
      <AdminTop title="Media">
        <a className="abtn" href={(await siteUrl()) || '/'} target="_blank" rel="noopener">
          View website
        </a>
      </AdminTop>
      <div className="abody">
        <MediaLibrary initial={items} />
      </div>
    </>
  );
}
