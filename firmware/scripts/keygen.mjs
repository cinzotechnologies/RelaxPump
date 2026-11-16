// Creates the OTA signing key pair (ECDSA P-256). Run ONCE, by the owner.
//   node firmware/scripts/keygen.mjs                         # private key → D:/keys/relaxpump-ota-sign.pem
//   node firmware/scripts/keygen.mjs --out E:/safe/ota.pem
//
// - The PRIVATE key is written OUTSIDE the repo and never overwritten. Keep a second copy offline
//   (USB stick): without it no update can ever be published to boards already in the field.
// - The PUBLIC key goes into firmware/include/ota_pubkey.h (safe to commit). Boards only accept
//   firmware signed with the matching private key (src/ota.cpp).
// - release.mjs reads the private key from RP_SIGN_KEY (its path).
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const i = process.argv.indexOf('--out');
const out = resolve(i > 0 ? process.argv[i + 1] : 'D:/keys/relaxpump-ota-sign.pem');
const headerFile = fileURLToPath(new URL('../include/ota_pubkey.h', import.meta.url));

const rel = relative(repo, out);
if (!rel.startsWith('..') && !isAbsolute(rel)) {
  console.error(`Refusing: ${out} is inside the repo. Put the private key somewhere else.`);
  process.exit(1);
}
if (existsSync(out)) {
  console.error(`${out} already exists. Not overwriting a signing key (boards in the field trust it).`);
  process.exit(1);
}
if (/BEGIN PUBLIC KEY/.test(readFileSync(headerFile, 'utf8')) && !process.argv.includes('--replace-public')) {
  console.error('include/ota_pubkey.h already has a public key. Boards trust that key; a new pair would make\n' +
    'every future update fail on them. Use --replace-public only if no board has that key yet.');
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });

const pub = publicKey.export({ type: 'spki', format: 'pem' }).trim();
writeFileSync(
  headerFile,
  `// OTA signing PUBLIC key (ECDSA P-256, PEM). Written by \`node firmware/scripts/keygen.mjs\`, which
// keeps the private key OUTSIDE the repo (RP_SIGN_KEY). The public half is safe to commit.
// Empty = no key yet: the board refuses every OTA update (err "no key").
#pragma once
static const char OTA_PUBKEY_PEM[] =
${pub.split('\n').map((l) => `    "${l}\\n"`).join('\n')};
`,
);
console.log(`Private key: ${out}   (keep it secret + a second offline copy)`);
console.log('Public key:  firmware/include/ota_pubkey.h (commit it)');
console.log(`For releases: set RP_SIGN_KEY=${out}`);
