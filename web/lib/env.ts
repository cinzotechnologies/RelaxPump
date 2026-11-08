import { getCloudflareContext } from '@opennextjs/cloudflare';

/** Worker bindings and vars (D1, R2, secrets). Server only. */
export function env(): CloudflareEnv {
  return getCloudflareContext().env;
}

/** Same, for code that runs at module scope or in static generation. */
export async function envAsync(): Promise<CloudflareEnv> {
  return (await getCloudflareContext({ async: true })).env;
}
