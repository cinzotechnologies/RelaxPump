import { Footer } from '@/components/site/Footer';
import { TopBar } from '@/components/site/TopBar';
import { DEFAULT_CONTACT } from '@/lib/content/contact';

import '@/styles/site.css';

/** Public pages: white top bar, page, dark footer — all inside the `site` container. */
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="site">
      <TopBar />
      <main>{children}</main>
      <Footer c={DEFAULT_CONTACT} />
    </div>
  );
}
