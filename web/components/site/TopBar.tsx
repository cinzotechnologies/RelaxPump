'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Burger } from '@/components/ui/icons';
import { Logo, Wordmark } from '@/components/ui/Logo';

type NavLink = { href: string; label: string; cur?: boolean };

const HOME_LINKS: NavLink[] = [
  { href: '/#how', label: 'How it works' },
  { href: '/#app', label: 'App' },
  { href: '/#guide', label: 'Guide' },
  { href: '/#download', label: 'Download' },
  { href: '/store', label: 'Store' },
  { href: '/#contact', label: 'Contact' },
];
const HOME_MENU: NavLink[] = [
  { href: '/#top', label: 'Home' },
  { href: '/#how', label: 'How it works' },
  { href: '/#app', label: 'App screens' },
  { href: '/#guide', label: 'Install guide' },
  { href: '/#manual', label: 'Manual' },
  { href: '/#download', label: 'Download' },
  { href: '/store', label: 'Store' },
  { href: '/#contact', label: 'Contact' },
];
// Store page (Shop.dc.html): Home first, Store marked current, cart button instead of "Get the app".
const STORE_LINKS: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/#how', label: 'How it works' },
  { href: '/#app', label: 'App' },
  { href: '/#guide', label: 'Guide' },
  { href: '/store', label: 'Store', cur: true },
  { href: '#contact', label: 'Contact' },
];
const STORE_MENU: NavLink[] = [
  { href: '/', label: 'Home' },
  { href: '/#how', label: 'How it works' },
  { href: '/store', label: 'Store' },
  { href: '#contact', label: 'Contact' },
];

/**
 * White top bar. Phone: burger → dropdown (Home first).
 * `variant="store"`: store links and a cart button (`right`) next to the burger.
 */
export function TopBar({ variant = 'home', right }: { variant?: 'home' | 'store'; right?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const store = variant === 'store';
  const links = store ? STORE_LINKS : HOME_LINKS;
  const menu = store ? STORE_MENU : HOME_MENU;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const burger = (
    <button
      className="burger"
      type="button"
      aria-label={open ? 'Close menu' : 'Open menu'}
      aria-expanded={open}
      aria-controls="mobile-menu"
      onClick={() => setOpen((o) => !o)}
    >
      <Burger open={open} />
    </button>
  );

  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Link className="brand" href="/" aria-label="RelaxPump home">
          <Logo />
          <Wordmark />
        </Link>
        <nav className="links" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={l.cur ? 'cur' : undefined}
              aria-current={l.cur ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        {store ? (
          <div className="nav-r">
            {right}
            {burger}
          </div>
        ) : (
          <>
            <Link className="btn sm nav-cta" href="/#download">
              Get the app
            </Link>
            {burger}
          </>
        )}
        <div id="mobile-menu" className={`mm${open ? ' open' : ''}`} inert={!open}>
          {menu.map((l) => (
            <Link key={l.label} href={l.href} onClick={close}>
              {l.label}
            </Link>
          ))}
          {store ? null : (
            <Link className="btn" href="/#download" onClick={close}>
              Get the app
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
