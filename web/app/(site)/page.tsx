import { Download } from '@/components/home/Download';
import { Features } from '@/components/home/Features';
import { Gallery } from '@/components/home/Gallery';
import { Guide } from '@/components/home/Guide';
import { Hero } from '@/components/home/Hero';
import { Manual } from '@/components/home/Manual';
import { StoreTeaser } from '@/components/home/StoreTeaser';
import { DEFAULT_HOME } from '@/lib/content/home';

import '@/components/home/home.css';

export default function Home() {
  const c = DEFAULT_HOME;
  return (
    <>
      <Hero c={c.hero} />
      <Features c={c.how} />
      <Gallery c={c.gallery} />
      <Guide c={c.guide} />
      <Manual c={c.manual} />
      <Download c={c.download} />
      <StoreTeaser c={c.store} />
    </>
  );
}
