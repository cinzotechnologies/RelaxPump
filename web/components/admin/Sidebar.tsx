'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LogoMark } from '@/components/ui/Logo';

import { AIcon, IC, initials } from './icons';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: IC.dash },
  { href: '/admin/website', label: 'Website', icon: IC.site },
  { href: '/admin/media', label: 'Media', icon: IC.media },
  { href: '/admin/requests', label: 'Password requests', icon: IC.key },
];

/** Left sidebar (phone: horizontal strip). Badge = password requests waiting. */
export function Sidebar({ waiting, email, name }: { waiting: number; email: string; name: string }) {
  const path = usePathname();
  const isOn = (href: string) => (href === '/admin' ? path === '/admin' : path.startsWith(href));
  return (
    <aside className="side" aria-label="Admin menu">
      <Link className="brand" href="/admin">
        <LogoMark size={36} />
        <span className="bt">
          <span>
            <span className="wm-relax">Relax</span>
            <span className="wm-pump">Pump</span>
          </span>
          <small>Admin</small>
        </span>
      </Link>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={isOn(n.href) ? 'navi on' : 'navi'}
          aria-current={isOn(n.href) ? 'page' : undefined}
        >
          <AIcon d={n.icon} />
          <span>{n.label}</span>
          {n.href === '/admin/requests' && waiting > 0 ? <span className="cnt">{waiting}</span> : null}
        </Link>
      ))}
      <div className="sfoot">
        <a className="navi" href="/" target="_blank" rel="noopener">
          <AIcon d={IC.ext} />
          <span>View website</span>
        </a>
        <a className="navi" href="/api/admin/signout">
          <AIcon d={IC.out} />
          <span>Sign out</span>
        </a>
        <div className="me">
          <span className="av">{initials(name)}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <b>{name}</b>
            <small>{email}</small>
          </span>
        </div>
      </div>
    </aside>
  );
}

/** Sticky page header: title on the left, actions on the right. */
export function AdminTop({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="top">
      <h1>{title}</h1>
      <span className="grow" />
      {children}
    </header>
  );
}
