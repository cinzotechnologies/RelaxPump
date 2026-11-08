'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { ProductArt } from '@/components/home/ProductArt';
import { ArrowLeft, ArrowRight, Phone } from '@/components/ui/icons';
import type { Contact } from '@/lib/content/contact';
import { CATEGORIES, type Product, type ProductCategory, priceLabel } from '@/lib/content/products';

import { useCart } from './cart';

const CART_ICON = (
  <>
    <path d="M3 4h2l2.4 11h11l2-8H6.2" />
    <circle cx="9.5" cy="20" r="1.4" />
    <circle cx="17" cy="20" r="1.4" />
  </>
);
const LINE_ICON: Record<Product['art'], string> = {
  ctrl: 'M4 5h16v14H4z M8 9h5v4H8z M16 9h.01',
  sensor: 'M4 8h16v8H4z M9 12h.01 M15 12h.01',
  valve: 'M2 13h20 M9 9h6v8H9z M10 5h4v4h-4z',
  relay: 'M5 5h14v14H5z M13 2l-3 6h4l-3 6',
  install: 'M3 11l9-7 9 7v9H3z M9 20v-6h6v6',
};
const Stroke = ({ size, children, w = 2 }: { size: number; children: React.ReactNode; w?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={w}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

/** Cart button in the store top bar (count pops in when items are added). */
export function CartButton() {
  const { count, setOpen } = useCart();
  return (
    <button
      className="cartb"
      type="button"
      aria-label={`Open cart, ${count} items`}
      onClick={() => setOpen(true)}
    >
      <Stroke size={21}>{CART_ICON}</Stroke>
      {count > 0 ? (
        <span className="cnt" key={count}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Stepper({
  q,
  onDec,
  onInc,
  small,
}: {
  q: number;
  onDec: () => void;
  onInc: () => void;
  small?: boolean;
}) {
  return (
    <div className={small ? 'step sm' : 'step'}>
      <button type="button" aria-label="Remove one" onClick={onDec}>
        −
      </button>
      <span aria-live="polite">{q}</span>
      <button type="button" aria-label="Add one" onClick={onInc}>
        +
      </button>
    </div>
  );
}

/** Category chips, product grid with add-to-cart steppers, help card and "why" tiles. */
export function Catalogue({ products, contact }: { products: Product[]; contact: Contact }) {
  const { cart, setQty } = useCart();
  const [cat, setCat] = useState<'All' | ProductCategory>('All');
  const shown = products.filter((p) => cat === 'All' || p.category === cat);

  return (
    <section className="shop-list">
      <div className="wrap">
        <div className="chips" role="tablist" aria-label="Categories">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={c === cat ? 'chip on' : 'chip'}
              type="button"
              role="tab"
              aria-selected={c === cat}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="pgrid">
          {shown.map((p, i) => {
            const q = cart[p.id] ?? 0;
            return (
              <article className="pc" key={`${cat}-${p.id}`} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="pimg">
                  <span className="ptag">{p.tag}</span>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- R2 media
                    <img src={p.imageUrl} alt={p.name} loading="lazy" />
                  ) : (
                    <ProductArt art={p.art} />
                  )}
                </div>
                <div className="pbody">
                  <h3>{p.name}</h3>
                  <div className="pfoot">
                    <span className="pprice2">
                      <small>Price</small>
                      <b>{priceLabel(p) ?? 'Coming soon'}</b>
                    </span>
                    {q > 0 ? (
                      <Stepper q={q} onDec={() => setQty(p.id, q - 1)} onInc={() => setQty(p.id, q + 1)} />
                    ) : (
                      <button className="btn nb" type="button" onClick={() => setQty(p.id, 1)}>
                        Add to cart
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {cat === 'All' || cat === 'Service' ? (
            <div className="cta pc">
              <span className="ring" />
              <h3>Not sure what you need?</h3>
              <div className="cta-btns">
                <a className="btn" href={`tel:${contact.phoneTel}`}>
                  Call {contact.phone}
                </a>
                <a className="btn" href={`mailto:${contact.email}`}>
                  Email us
                </a>
              </div>
            </div>
          ) : null}
        </div>
        <div className="why">
          <div className="w">
            <span className="wi">
              <Stroke size={22}>
                <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
              </Stroke>
            </span>
            <h3>Installed by CINZO</h3>
          </div>
          <div className="w">
            <span className="wi">
              <Stroke size={22}>
                <path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3z M5 6c0 1.7 3.1 3 7 3s7-1.3 7-3" />
              </Stroke>
            </span>
            <h3>Up to 3 tanks</h3>
          </div>
          <div className="w">
            <span className="wi">
              <Phone size={22} />
            </span>
            <h3>Local support</h3>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Slide-in cart drawer → checkout form. "Place order" stays disabled while ordering is closed. */
export function CartDrawer({
  products,
  contact,
  orderingOpen,
}: {
  products: Product[];
  contact: Contact;
  orderingOpen: boolean;
}) {
  const { cart, count, setQty, open, setOpen } = useCart();
  const [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const [pay, setPay] = useState<'cod' | 'upi'>('cod');
  const closeRef = useRef<HTMLButtonElement>(null);
  const lines = products.filter((p) => cart[p.id]);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, setOpen]);

  // Opening the cart always starts at the cart step (Shop.dc.html openCart).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep('cart');
  }

  return (
    <>
      <button
        className={open ? 'scrim open' : 'scrim'}
        type="button"
        tabIndex={-1}
        aria-label="Close cart"
        onClick={close}
      />
      <aside className={open ? 'drawer open' : 'drawer'} aria-label="Cart" aria-hidden={!open} inert={!open}>
        <div className="dh">
          {step === 'checkout' ? (
            <button className="xb" type="button" aria-label="Back to cart" onClick={() => setStep('cart')}>
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <h2>{step === 'cart' ? 'Your cart' : 'Checkout'}</h2>
          <button className="xb" type="button" aria-label="Close" onClick={close} ref={closeRef}>
            <Stroke size={18}>
              <path d="M6 6l12 12M18 6L6 18" />
            </Stroke>
          </button>
        </div>

        {step === 'cart' ? (
          <div className="db slide">
            {count === 0 ? (
              <div className="empty">
                <span className="ico">
                  <Stroke size={30}>{CART_ICON}</Stroke>
                </span>
                <b>Your cart is empty</b>
                <span>Start with the Controller Kit.</span>
                <button className="btn" type="button" onClick={close}>
                  Browse products
                </button>
              </div>
            ) : (
              <>
                {lines.map((p) => {
                  const q = cart[p.id];
                  return (
                    <div className="li" key={p.id}>
                      <span className="lim">
                        <Stroke size={28}>
                          <path d={LINE_ICON[p.art]} />
                        </Stroke>
                      </span>
                      <span className="lit">
                        <b>{p.name}</b>
                        <span>{priceLabel(p) ?? 'Price coming soon'}</span>
                      </span>
                      <Stepper
                        small
                        q={q}
                        onDec={() => setQty(p.id, q - 1)}
                        onInc={() => setQty(p.id, q + 1)}
                      />
                    </div>
                  );
                })}
                <div className="sum">
                  <div>
                    <span>Items</span>
                    <b>{count}</b>
                  </div>
                  <div>
                    <span>Subtotal</span>
                    <b>{subtotal(lines, cart) ?? 'Price soon'}</b>
                  </div>
                  <div>
                    <span>Installation</span>
                    <b>Quoted on call</b>
                  </div>
                </div>
                <button
                  className="btn"
                  type="button"
                  style={{ width: '100%', marginTop: 6 }}
                  onClick={() => setStep('checkout')}
                >
                  Checkout
                  <ArrowRight size={18} />
                </button>
              </>
            )}
          </div>
        ) : (
          <form className="db slide" onSubmit={(e) => e.preventDefault()}>
            <label className="fld" htmlFor="oname">
              Full name
              <input
                className="inp"
                id="oname"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Your name"
              />
            </label>
            <label className="fld" htmlFor="ophone">
              Phone
              <input
                className="inp"
                id="ophone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="+91 10-digit number"
              />
            </label>
            <label className="fld" htmlFor="oaddr">
              Address
              <input
                className="inp"
                id="oaddr"
                name="address"
                type="text"
                autoComplete="street-address"
                placeholder="House, street, locality"
              />
            </label>
            <div className="fld2">
              <label className="fld" htmlFor="otown">
                Town
                <input
                  className="inp"
                  id="otown"
                  name="town"
                  type="text"
                  autoComplete="address-level2"
                  placeholder="Town"
                />
              </label>
              <label className="fld" htmlFor="opin">
                PIN code
                <input
                  className="inp"
                  id="opin"
                  name="pin"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="6 digits"
                />
              </label>
            </div>
            <span className="fld" style={{ marginTop: 6 }}>
              Payment
            </span>
            <label className={pay === 'cod' ? 'pay on' : 'pay'}>
              <input type="radio" name="pay" checked={pay === 'cod'} onChange={() => setPay('cod')} />
              <span>Cash on delivery</span>
            </label>
            <label className={pay === 'upi' ? 'pay on' : 'pay'}>
              <input type="radio" name="pay" checked={pay === 'upi'} onChange={() => setPay('upi')} />
              <span>UPI</span>
            </label>
            <button
              className="btn"
              type="submit"
              disabled={!orderingOpen}
              style={{ width: '100%', marginTop: 8 }}
            >
              {orderingOpen ? 'Place order' : 'Place order — opens soon'}
            </button>
            <p className="order-note">
              Order now: <a href={`tel:${contact.phoneTel}`}>{contact.phone}</a>
            </p>
          </form>
        )}
      </aside>
    </>
  );
}

/** Sum of priced lines; null if any line has no price yet. */
function subtotal(lines: Product[], cart: Record<string, number>): string | null {
  if (!lines.length || lines.some((p) => p.price == null)) return null;
  const total = lines.reduce((a, p) => a + (p.price ?? 0) * (cart[p.id] ?? 0), 0);
  return priceLabel({ price: total });
}

/** Header: crumb, title, "orders open soon" note. */
export function StoreHead({ contact }: { contact: Contact }) {
  return (
    <section className="shop-head" id="top">
      <div className="wrap">
        <div className="crumb in d1">
          <Link href="/">Home</Link>
          <span aria-hidden>/</span>
          <span>Store</span>
        </div>
        <h1 className="h1 in d2">
          RelaxPump <em>Store</em>
        </h1>
        <div className="note in d4">
          <Stroke size={22}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </Stroke>
          <span>
            <b>Online orders open soon.</b> Order now: <a href={`tel:${contact.phoneTel}`}>{contact.phone}</a>
          </span>
        </div>
      </div>
    </section>
  );
}
