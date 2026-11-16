// Products (seed for the D1 `products` table; migrations/0003_v3.sql brings a live store to this list).
// Shop.dc.html lists them all; the home teaser shows the `featured` ones (Household Controller,
// PHE Controller, Home Installation). docs/two-module-system.md §7.

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
    name: 'Household Controller',
    desc: 'Runs your pump and up to 5 semi tanks.',
    category: 'Kits',
    tag: 'Household',
    art: 'ctrl',
    price: null,
    imageUrl: null,
    featured: true,
  },
  {
    id: 'phectrl',
    name: 'PHE Controller',
    desc: 'Fills up to 5 tanks from PHE lines. No pump needed.',
    category: 'Kits',
    tag: 'PHE',
    art: 'ctrl',
    price: null,
    imageUrl: null,
    featured: true,
  },
  {
    id: 'tank',
    name: 'Tank Kit',
    desc: 'One sensor and one valve for a semi tank.',
    category: 'Kits',
    tag: 'Per tank',
    art: 'valve',
    price: null,
    imageUrl: null,
    featured: false,
  },
  {
    id: 'phe',
    name: 'PHE Line Kit',
    desc: 'Sensor + zero-pressure valve for one PHE line.',
    category: 'Kits',
    tag: 'Per PHE line',
    art: 'valve',
    price: null,
    imageUrl: null,
    featured: false,
  },
  {
    id: 'main',
    name: 'Main Tank Kit',
    desc: 'Sensor for the main tank: the pump never runs it dry.',
    category: 'Kits',
    tag: 'Main tank',
    art: 'sensor',
    price: null,
    imageUrl: null,
    featured: false,
  },
  {
    id: 'pump',
    name: 'Pump Kit',
    desc: 'Contactor sized to your pump.',
    category: 'Kits',
    tag: 'Pump',
    art: 'relay',
    price: null,
    imageUrl: null,
    featured: false,
  },
  {
    id: 'sensor',
    name: 'Level Sensor',
    desc: 'Sensor only. One tank on the Household controller needs no valve.',
    category: 'Add-ons',
    tag: 'Add-on',
    art: 'sensor',
    price: null,
    imageUrl: null,
    featured: false,
  },
  {
    id: 'valve',
    name: 'Solenoid Valve 12 V',
    desc: 'Valve only. Closes by itself in a power cut.',
    category: 'Add-ons',
    tag: 'Add-on',
    art: 'valve',
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
