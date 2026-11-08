import type { Metadata } from 'next';

import { Footer } from '@/components/site/Footer';
import { TopBar } from '@/components/site/TopBar';
import { CartProvider } from '@/components/store/cart';
import { CartButton, CartDrawer, Catalogue, StoreHead } from '@/components/store/StoreView';
import { DEFAULT_CONTACT } from '@/lib/content/contact';
import { DEFAULT_PRODUCTS } from '@/lib/content/products';

import '@/components/store/products.css';
import '@/components/store/store.css';

export const metadata: Metadata = {
  title: 'Store — RelaxPump',
  description: 'RelaxPump controller kit, sensors, valves and home installation.',
};

export default function StorePage() {
  const products = DEFAULT_PRODUCTS;
  const contact = DEFAULT_CONTACT;
  const orderingOpen = false; // settings.ordering_open from D1 (W5)
  return (
    <CartProvider ids={products.map((p) => p.id)}>
      <div className="shop">
        <TopBar variant="store" right={<CartButton />} />
        <main>
          <StoreHead contact={contact} />
          <Catalogue products={products} contact={contact} />
        </main>
        <Footer c={contact} variant="store" />
        <CartDrawer products={products} contact={contact} orderingOpen={orderingOpen} />
      </div>
    </CartProvider>
  );
}
