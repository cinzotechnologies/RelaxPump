// Deploy database.rules.json with the service account (no `firebase login` needed).
//   npm run deploy:rules
import { readFileSync } from 'node:fs';

import { admin } from './_admin.mjs';

const rules = readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
const { db } = admin();
await db.setRules(rules);
console.log('Rules deployed to', db.app.options.databaseURL);
process.exit(0);
