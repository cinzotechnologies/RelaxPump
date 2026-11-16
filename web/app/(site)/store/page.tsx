import type { Metadata } from 'next';

import { Footer } from '@/components/site/Footer';
import { TopBar } from '@/components/site/TopBar';
import { CartProvider } from '@/components/store/cart';
import { PlanKit } from '@/components/store/PlanKit';
import { CartButton, CartDrawer, Catalogue, StoreHead } from '@/components/store/StoreView';
import { getProducts, getSite, isPreview, orderingOpen } from '@/lib/content/load';

import '@/components/store/products.css';
import '@/components/store/store.css';

export const metadata: Metadata = {
  title: 'Store — RelaxPump',
  description:
    'RelaxPump Household and PHE controllers, tank and PHE line kits, sensors, valves and home installation. Plan your kit.',
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
          <PlanKit contact={contact} ids={products.map((p) => p.id)} />
          <Catalogue products={products} contact={contact} />
        </main>
        <Footer c={contact} variant="store" />
        <CartDrawer products={products} contact={contact} orderingOpen={open} />
      </div>
    </CartProvider>
  );
}
