'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Burger } from '@/components/ui/icons';
import { Logo, Wordmark } from '@/components/ui/Logo';

const LINKS = [
  { href: '/#how', label: 'How it works' },
  { href: '/#app', label: 'App' },
  { href: '/#guide', label: 'Guide' },
  { href: '/#download', label: 'Download' },
  { href: '/store', label: 'Store' },
  { href: '/#contact', label: 'Contact' },
];

const MENU = [
  { href: '/#top', label: 'Home' },
  { href: '/#how', label: 'How it works' },
  { href: '/#app', label: 'App screens' },
  { href: '/#guide', label: 'Install guide' },
  { href: '/#manual', label: 'Manual' },
  { href: '/#download', label: 'Download' },
  { href: '/store', label: 'Store' },
  { href: '/#contact', label: 'Contact' },
];

/** White top bar. Phone: burger → dropdown (Home first). */
export function TopBar({ extra }: { extra?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="nav">
      <div className="wrap nav-in">
        <Link className="brand" href="/#top" aria-label="RelaxPump home">
          <Logo />
          <Wordmark />
        </Link>
        <nav className="links" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
        <Link className="btn sm nav-cta" href="/#download">
          Get the app
        </Link>
        {extra}
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
        <div id="mobile-menu" className={`mm${open ? ' open' : ''}`} inert={!open}>
          {MENU.map((l) => (
            <Link key={l.href} href={l.href} onClick={close}>
              {l.label}
            </Link>
          ))}
          <Link className="btn" href="/#download" onClick={close}>
            Get the app
          </Link>
        </div>
      </div>
    </header>
  );
}
