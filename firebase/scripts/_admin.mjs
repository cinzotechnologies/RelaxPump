// Shared admin setup for the scripts. Uses the service account key, which never goes in the repo.
import { existsSync, readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

export const DB_URL = 'https://iotcinzo-default-rtdb.asia-southeast1.firebasedatabase.app';
export const DEVICE_DOMAIN = 'devices.relaxpump.app';
export const USER_DOMAIN = 'users.relaxpump.app';

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || 'D:/keys/iotcinzo-admin.json';

export function admin() {
  if (!existsSync(keyPath)) {
    console.error(`Service account key not found: ${keyPath}\nSet GOOGLE_APPLICATION_CREDENTIALS to its path.`);
    process.exit(1);
  }
  const app = initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, 'utf8'))), databaseURL: DB_URL });
  return { auth: getAuth(app), db: getDatabase(app) };
}

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
