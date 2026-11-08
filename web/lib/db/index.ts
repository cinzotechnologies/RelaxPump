import { drizzle } from 'drizzle-orm/d1';

import { envAsync } from '@/lib/env';

import * as schema from './schema';

/**
 * Drizzle over the Worker's D1 binding. Server only. Async so that the first request in
 * `next dev` waits for the local bindings instead of racing them.
 */
export async function db() {
  return drizzle((await envAsync()).DB, { schema });
}

export { schema };
