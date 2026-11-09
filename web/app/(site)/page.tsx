import { Download } from '@/components/home/Download';
import { Features } from '@/components/home/Features';
import { Gallery } from '@/components/home/Gallery';
import { Guide } from '@/components/home/Guide';
import { Hero } from '@/components/home/Hero';
import { Manual } from '@/components/home/Manual';
import { StoreTeaser } from '@/components/home/StoreTeaser';
import { Footer } from '@/components/site/Footer';
import { TopBar } from '@/components/site/TopBar';
import { getProducts, getSite, isPreview } from '@/lib/content/load';

import '@/components/home/home.css';
import '@/components/store/products.css';

// Content comes from D1 on every request (Publish in the admin shows up at once).
export const dynamic = 'force-dynamic';

export default async function Home() {
  const preview = await isPreview();
  const [c, products] = await Promise.all([getSite(), getProducts(preview)]);
  return (
    <>
      <TopBar />
      <main>
        <Hero c={c.hero} />
        <Features c={c.how} />
        <Gallery c={c.gallery} />
        <Guide c={c.guide} />
        <Manual c={c.manual} />
        <Download c={c.download} />
        <StoreTeaser c={c.store} products={products.filter((p) => p.featured)} />
      </main>
      <Footer c={c.contact} />
    </>
  );
}
