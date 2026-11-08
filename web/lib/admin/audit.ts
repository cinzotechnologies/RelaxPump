import 'server-only';

import { db, schema } from '@/lib/db';

/** Every admin action writes a row (brief §3). Never store passwords here. */
export async function audit(who: string, action: string, detail?: unknown) {
  await (
    await db()
  )
    .insert(schema.auditLog)
    .values({ who, action, detail: detail === undefined ? null : JSON.stringify(detail), at: Date.now() });
}
