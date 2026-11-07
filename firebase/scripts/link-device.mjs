// Testing/support: link a controller to a customer account without the app's QR claim.
//   npm run link-device -- --id RP-3F2A9C --phone 9876543210
import { admin, arg, USER_DOMAIN } from './_admin.mjs';

const id = arg('id');
const phone = arg('phone');
if (!id || !/^\d{10}$/.test(phone ?? '')) {
  console.error('Usage: npm run link-device -- --id RP-XXXXXX --phone 9876543210');
  process.exit(1);
}
const { auth, db } = admin();
const user = await auth.getUserByEmail(`91${phone}@${USER_DOMAIN}`);
await db.ref().update({ [`devices/${id}/info/ownerUid`]: user.uid, [`users/${user.uid}/devices/${id}`]: true });
console.log(`${id} linked to +91 ${phone}`);
process.exit(0);
