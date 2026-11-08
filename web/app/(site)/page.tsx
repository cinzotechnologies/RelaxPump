import { Download } from '@/components/home/Download';
import { Features } from '@/components/home/Features';
import { Gallery } from '@/components/home/Gallery';
import { Guide } from '@/components/home/Guide';
import { Hero } from '@/components/home/Hero';
import { Manual } from '@/components/home/Manual';
import { StoreTeaser } from '@/components/home/StoreTeaser';
import { Footer } from '@/components/site/Footer';
import { TopBar } from '@/components/site/TopBar';
import { DEFAULT_CONTACT } from '@/lib/content/contact';
import { DEFAULT_HOME } from '@/lib/content/home';
import { DEFAULT_PRODUCTS } from '@/lib/content/products';

import '@/components/home/home.css';
import '@/components/store/products.css';

export default function Home() {
  const c = DEFAULT_HOME;
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
        <StoreTeaser c={c.store} products={DEFAULT_PRODUCTS.filter((p) => p.featured)} />
      </main>
      <Footer c={DEFAULT_CONTACT} />
    </>
  );
}
