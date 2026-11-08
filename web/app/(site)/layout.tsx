import '@/styles/site.css';

/** Public pages live inside the `site` container (breakpoints are container queries). */
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return <div className="site">{children}</div>;
}
