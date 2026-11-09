import type { Metadata } from 'next';

import { Footer } from '@/components/site/Footer';
import { TopBar } from '@/components/site/TopBar';
import { CartProvider } from '@/components/store/cart';
import { CartButton, CartDrawer, Catalogue, StoreHead } from '@/components/store/StoreView';
import { getProducts, getSite, isPreview, orderingOpen } from '@/lib/content/load';

import '@/components/store/products.css';
import '@/components/store/store.css';

export const metadata: Metadata = {
  title: 'Store — RelaxPump',
  description: 'RelaxPump controller kit, sensors, valves and home installation.',
};

export const dynamic = 'force-dynamic';

export default async function StorePage() {
  const preview = await isPreview();
  const [site, products, open] = await Promise.all([getSite(), getProducts(preview), orderingOpen(preview)]);
  const contact = site.contact;
  return (
    <CartProvider ids={products.map((p) => p.id)}>
      <div className="shop">
        <TopBar variant="store" right={<CartButton />} />
        <main>
          <StoreHead contact={contact} orderingOpen={open} />
          <Catalogue products={products} contact={contact} />
        </main>
        <Footer c={contact} variant="store" />
        <CartDrawer products={products} contact={contact} orderingOpen={open} />
      </div>
    </CartProvider>
  );
}
