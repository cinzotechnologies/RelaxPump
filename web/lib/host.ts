// Two hostnames, one Worker: the public site (SITE_URL, e.g. relaxpump.cinzotechnologies.com)
// and the admin panel (ADMIN_HOST, e.g. relaxpumpadmin.cinzotechnologies.com). On localhost, or
// with ADMIN_HOST unset, both live on one host (local dev keeps working with production vars).
import 'server-only';

import { headers } from 'next/headers';

import { envAsync } from '@/lib/env';

const bare = (h: string | null | undefined) => (h ?? '').toLowerCase().split(':')[0];
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

async function requestHost(): Promise<string> {
  return bare((await headers()).get('host'));
}

/** 'admin' on the admin host, 'site' on any other host, 'both' locally or when unset. */
export async function hostKind(): Promise<'admin' | 'site' | 'both'> {
  const adminHost = bare((await envAsync()).ADMIN_HOST);
  const host = await requestHost();
  if (!adminHost || LOCAL.has(host)) return 'both';
  return host === adminHost ? 'admin' : 'site';
}

/** Absolute link to the public site ("" = same host, as on localhost). */
export async function siteUrl(): Promise<string> {
  if ((await hostKind()) === 'both') return '';
  return ((await envAsync()).SITE_URL ?? '').replace(/\/$/, '');
}
