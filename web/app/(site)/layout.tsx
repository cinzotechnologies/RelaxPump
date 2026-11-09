import { redirect } from 'next/navigation';

import { isPreview } from '@/lib/content/load';
import { hostKind } from '@/lib/host';

import '@/styles/site.css';

/** Public pages live inside the `site` container (breakpoints are container queries). */
export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  const preview = await isPreview();
  // the admin host shows the site only as a Preview of drafts
  if (!preview && (await hostKind()) === 'admin') redirect('/admin');
  return (
    <div className="site">
      {preview ? (
        <div className="preview-bar" role="status">
          Preview — unpublished changes are shown. <a href="/api/admin/preview?off=1">Exit preview</a>
        </div>
      ) : null}
      {children}
    </div>
  );
}
