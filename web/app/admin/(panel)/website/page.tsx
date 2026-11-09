import { WebsiteEditor } from '@/components/admin/WebsiteEditor';
import { loadEditor } from '@/lib/admin/content';

export const dynamic = 'force-dynamic';

export default async function WebsitePage({ searchParams }: PageProps<'/admin/website'>) {
  const [st, sp] = await Promise.all([loadEditor(), searchParams]);
  return (
    <WebsiteEditor
      draft={st.draft}
      live={st.live}
      shop={st.shop}
      liveShop={st.liveShop}
      lastPublished={st.lastPublished}
      startSec={typeof sp.sec === 'string' ? sp.sec : 'hero'}
    />
  );
}
