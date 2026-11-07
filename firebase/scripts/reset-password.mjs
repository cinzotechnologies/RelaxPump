// Support tool: set a new password for a customer (Forgot password, until SMS OTP is enabled).
//   npm run reset-password -- --phone 9876543210 --password newpass123
import { admin, arg, USER_DOMAIN } from './_admin.mjs';

const phone = arg('phone');
const password = arg('password');
if (!/^\d{10}$/.test(phone ?? '') || !password || password.length < 6) {
  console.error('Usage: npm run reset-password -- --phone 9876543210 --password newpass123');
  process.exit(1);
}
const { auth } = admin();
const user = await auth.getUserByEmail(`91${phone}@${USER_DOMAIN}`);
await auth.updateUser(user.uid, { password });
await auth.revokeRefreshTokens(user.uid);
console.log(`Password updated for +91 ${phone}`);
process.exit(0);
