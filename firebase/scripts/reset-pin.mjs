// Support tool: "Forgot installer PIN". Removes the PIN so the next Installer setup sets a new one.
//   npm run reset-pin -- --id RP-3F2A9C
import { admin, arg } from './_admin.mjs';

const id = (arg('id') ?? '').toUpperCase();
if (!/^RP-[0-9A-F]{6}$/.test(id)) {
  console.error('Usage: npm run reset-pin -- --id RP-3F2A9C');
  process.exit(1);
}
const { db } = admin();
if (!(await db.ref(`devices/${id}/info`).get()).exists()) {
  console.error(`${id} not found`);
  process.exit(1);
}
await db.ref().update({ [`installerPins/${id}`]: null, [`pinAttempts/${id}`]: null, [`pinChecks/${id}`]: null });
console.log(`Installer PIN removed for ${id}. The owner sets a new one in Installer setup.`);
process.exit(0);
