import { isPreview } from '@/lib/content/load';

import '@/styles/site.css';

/** Public pages live inside the `site` container (breakpoints are container queries). */
export default async function SiteLayout({ children }: LayoutProps<'/'>) {
  const preview = await isPreview();
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
