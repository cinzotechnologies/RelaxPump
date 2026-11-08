// Products (seed for the D1 `products` table). Shop.dc.html lists all five; the home
// teaser shows the `featured` ones (kit, sensor, installation).

export type ProductCategory = 'Kits' | 'Add-ons' | 'Service';
export type ProductArtKind = 'ctrl' | 'sensor' | 'valve' | 'relay' | 'install';

export type Product = {
  id: string;
  name: string;
  desc: string;
  category: ProductCategory;
  tag: string;
  art: ProductArtKind;
  /** Rupees; null = "Coming soon". */
  price: number | null;
  imageUrl: string | null;
  featured: boolean;
};

export const CATEGORIES: ('All' | ProductCategory)[] = ['All', 'Kits', 'Add-ons', 'Service'];

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'kit',
    name: 'RelaxPump Controller Kit',
    desc: 'The ESP32 controller that runs your pump and up to 3 tanks.',
    category: 'Kits',
    tag: 'Start here',
    art: 'ctrl',
    price: null,
    imageUrl: null,
    featured: true,
  },
  {
    id: 'sensor',
    name: 'Ultrasonic Level Sensor',
    desc: 'One sensor per tank shows its level live in the app.',
    category: 'Add-ons',
    tag: 'Add-on',
    art: 'sensor',
    price: null,
    imageUrl: null,
    featured: true,
  },
  {
    id: 'valve',
    name: 'Solenoid Valve',
    desc: 'Opens and closes the line to each tank, so one tank fills at a time.',
    category: 'Add-ons',
    tag: 'Add-on',
    art: 'valve',
    price: null,
    imageUrl: null,
    featured: false,
  },
  {
    id: 'relay',
    name: 'Pump Relay + Contactor',
    desc: 'Switches your pump safely from the controller.',
    category: 'Add-ons',
    tag: 'Add-on',
    art: 'relay',
    price: null,
    imageUrl: null,
    featured: false,
  },
  {
    id: 'install',
    name: 'Home Installation',
    desc: 'Our team fits the kit, wires the pump and sets up the app with you.',
    category: 'Service',
    tag: 'Service',
    art: 'install',
    price: null,
    imageUrl: null,
    featured: true,
  },
];

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** "₹4,999" or null when there is no price yet. */
export function priceLabel(p: Pick<Product, 'price'>): string | null {
  return p.price == null ? null : inr.format(p.price);
}
