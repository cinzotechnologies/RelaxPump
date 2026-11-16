// Publishes a firmware update for the app's Software update card (docs/two-module-system.md §4.3).
//
//   node firmware/scripts/release.mjs --dry-run                  # build + sign + verify, publish nothing
//   node firmware/scripts/release.mjs --notes "Faster Wi-Fi|PHE overflow alarm"
//                                    [--rollout 10] [--min-fw 3.0.0]
//   node firmware/scripts/release.mjs --rollout 100              # widen the CURRENT release only
//   node firmware/scripts/release.mjs --rollout 0                # pause it (boards stop offering it)
//
// A new release:
//   1. builds env:release (no secrets.h inside: the binary is public), version = FW_VERSION in
//      src/config.h, and checks it fits the smaller OTA slot (4 MB boards, min_spiffs: 1.875 MB);
//   2. sha256 + ECDSA P-256 signature with the private key at RP_SIGN_KEY (keygen.mjs), then checks
//      the signature against include/ota_pubkey.h, the key the boards trust;
//   3. uploads relaxpump-<version>.bin to the GitHub Release fw-v<version> (GITHUB_TOKEN with
//      "contents: write" on this repo, or the gh CLI when it is logged in);
//   4. writes firmware/stable in Firebase (service account key, like the other scripts) with
//      rollout 10 %: the boards whose bucket (sha256(id) % 100) is below it offer the update.
//      Watch them, then run again with --rollout 100.
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fw = fileURLToPath(new URL('../', import.meta.url));
const repoDir = join(fw, '..');
const has = (f) => process.argv.includes(`--${f}`);
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const fail = (m) => {
  console.error(m);
  process.exit(1);
};
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const SLOT_BYTES = 0x1e0000; // min_spiffs.csv app slot (Rev C has 3 MB)

const dry = has('dry-run');
const rolloutArg = arg('rollout');
const rollout = rolloutArg === undefined ? 10 : Number(rolloutArg);
if (!Number.isInteger(rollout) || rollout < 0 || rollout > 100) fail('--rollout must be 0..100');

const { admin } = await import('../../firebase/scripts/_admin.mjs');

// ---------------------------------------------------------------- widen/pause the current release
const onlyRollout = rolloutArg !== undefined && !has('notes') && !has('min-fw') && !dry && !has('new');
if (onlyRollout) {
  const { db } = admin();
  const ref = db.ref('firmware/stable');
  const cur = (await ref.get()).val();
  if (!cur) fail('No firmware/stable yet. Publish a release first (add --notes "…" or --new).');
  await ref.update({ rollout });
  console.log(`firmware/stable ${cur.version}: rollout ${cur.rollout}% → ${rollout}%`);
  process.exit(0);
}

// ---------------------------------------------------------------- checks before building
const version = (/#define FW_VERSION "([^"]+)"/.exec(readFileSync(join(fw, 'src', 'config.h'), 'utf8')) || [])[1];
if (!VERSION_RE.test(version || '')) fail('FW_VERSION in src/config.h must be x.y.z');
const minFw = arg('min-fw', '0.0.0');
if (!VERSION_RE.test(minFw)) fail('--min-fw must be x.y.z');
const notes = (arg('notes', '') || '').split('|').map((s) => s.trim()).filter(Boolean);
if (notes.some((n) => n.length > 120)) fail('each note must be at most 120 characters');

const pubPem = (readFileSync(join(fw, 'include', 'ota_pubkey.h'), 'utf8').match(/"([^"]*)\\n"/g) || [])
  .map((l) => l.slice(1, -3))
  .join('\n');
if (!pubPem.includes('BEGIN PUBLIC KEY')) fail('include/ota_pubkey.h has no key: run node firmware/scripts/keygen.mjs first');
const keyPath = process.env.RP_SIGN_KEY;
if (!keyPath || !existsSync(keyPath)) fail('Set RP_SIGN_KEY to the private key file (from keygen.mjs).');
const privateKey = createPrivateKey(readFileSync(keyPath));
const publicKey = createPublicKey(`${pubPem}\n`);
if (
  createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('hex') !==
  publicKey.export({ type: 'spki', format: 'der' }).toString('hex')
)
  fail('RP_SIGN_KEY does not match include/ota_pubkey.h: the boards would refuse this update.');
if (!existsSync(join(fw, 'include', 'project.h'))) fail('include/project.h missing: node firmware/scripts/make-project-h.mjs');

const git = (...a) => execFileSync('git', a, { cwd: repoDir, encoding: 'utf8' }).trim();
if (!dry) {
  if (git('status', '--porcelain', '--', 'firmware')) fail('firmware/ has uncommitted changes: commit and push first.');
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') fail('Release from main.');
}

// ---------------------------------------------------------------- build, hash, sign
const pio = join(homedir(), '.platformio', 'penv', process.platform === 'win32' ? 'Scripts/pio.exe' : 'bin/pio');
console.log(`Building ${version} (env:release) …`);
execFileSync(pio, ['run', '-e', 'release'], { cwd: fw, stdio: 'inherit' });
const bin = readFileSync(join(fw, '.pio', 'build', 'release', 'firmware.bin'));
if (bin.length > SLOT_BYTES) fail(`firmware.bin is ${bin.length} bytes, the OTA slot holds ${SLOT_BYTES}.`);
if (bin.length > SLOT_BYTES * 0.95)
  console.warn(`WARNING: ${((bin.length / SLOT_BYTES) * 100).toFixed(1)} % of the 4 MB boards' OTA slot is used. Trim before the next feature.`);
// No device secret may be inside the public binary: the dev secrets.h values and every factory
// board's password / claim code (firebase/out/*/device.json).
const secrets = [];
const devH = join(fw, 'include', 'secrets.h');
if (existsSync(devH))
  for (const m of readFileSync(devH, 'utf8').matchAll(/#define RP_(?:DEVICE_PASSWORD|CLAIM_CODE|POP)\s+"([^"]+)"/g))
    secrets.push(m[1]);
const outRoot = join(repoDir, 'firebase', 'out');
if (existsSync(outRoot))
  for (const d of readdirSync(outRoot)) {
    const f = join(outRoot, d, 'device.json');
    if (existsSync(f)) {
      const j = JSON.parse(readFileSync(f, 'utf8'));
      secrets.push(j.password, j.code, j.pop);
    }
  }
if (secrets.some((v) => v && v.length >= 6 && bin.includes(Buffer.from(v)))) fail('The binary contains a device secret. Not publishing.');

const sha256 = createHash('sha256').update(bin).digest('hex');
const sig = sign('sha256', bin, { key: privateKey, dsaEncoding: 'der' }).toString('base64');
if (!verify('sha256', bin, { key: publicKey, dsaEncoding: 'der' }, Buffer.from(sig, 'base64'))) fail('Signature check failed.');
const asset = `relaxpump-${version}.bin`;
const outDir = join(fw, '.pio', 'release');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, asset), bin);

const remote = git('remote', 'get-url', 'origin');
const [, owner, repo] = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(remote) || [];
if (!owner) fail(`origin is not a GitHub repo: ${remote}`);
const tag = `fw-v${version}`;
const url = `https://github.com/${owner}/${repo}/releases/download/${tag}/${asset}`;
const stable = {
  version,
  url,
  sha256,
  sig,
  size: bin.length,
  minFw,
  rollout,
  date: new Date().toISOString().slice(0, 10),
  ...(notes.length ? { notes } : {}),
};
console.log(`\n${asset}: ${bin.length} bytes\n  sha256 ${sha256}\n  sig    ${sig.length} chars (verified against ota_pubkey.h)`);

if (dry) {
  console.log(`\nDry run: nothing published. Would set firmware/stable to:\n${JSON.stringify(stable, null, 2)}`);
  process.exit(0);
}

// ---------------------------------------------------------------- GitHub Release
const { db } = admin();
const cur = (await db.ref('firmware/stable').get()).val();
if (cur && cur.version === version && cur.sha256 !== sha256)
  fail(`${version} is already released with another binary. Raise FW_VERSION in src/config.h.`);

const notesMd = notes.length ? notes.map((n) => `- ${n}`).join('\n') : 'Firmware update.';
const body = `RelaxPump controller firmware ${version} (Household + PHE).\n\n${notesMd}\n\nsha256: \`${sha256}\`\nsignature (ECDSA P-256, base64 DER): \`${sig}\`\n`;
await publishGithub();

// The URL must answer before the boards are told about it.
const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
if (!head.ok) fail(`Download URL answers ${head.status}: ${url}`);

await db.ref('firmware/stable').set(stable);
console.log(`\nfirmware/stable = ${version}, rollout ${rollout}%${cur ? ` (was ${cur.version})` : ''}`);
console.log('Next: check the boards in the bucket report ota.phase "done" (app → My devices),');
console.log('then: node firmware/scripts/release.mjs --rollout 100');
process.exit(0);

async function publishGithub() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    // gh CLI (logged in) as the fallback
    try {
      execFileSync('gh', ['--version'], { stdio: 'ignore' });
    } catch {
      fail('Set GITHUB_TOKEN (fine-grained, this repo, Contents: read and write) or install + log in to gh.');
    }
    const exists = (() => {
      try {
        execFileSync('gh', ['release', 'view', tag, '-R', `${owner}/${repo}`], { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    })();
    const file = join(outDir, asset);
    if (exists) execFileSync('gh', ['release', 'upload', tag, file, '--clobber', '-R', `${owner}/${repo}`], { stdio: 'inherit' });
    else {
      writeFileSync(join(outDir, 'notes.md'), body);
      execFileSync('gh', ['release', 'create', tag, file, '-R', `${owner}/${repo}`, '--title', `Firmware ${version}`, '--notes-file', join(outDir, 'notes.md'), '--target', 'main'], { stdio: 'inherit' });
    }
    return;
  }
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  let rel = await fetch(`${api}/releases/tags/${tag}`, { headers: h });
  if (rel.status === 404) {
    rel = await fetch(`${api}/releases`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ tag_name: tag, target_commitish: git('rev-parse', 'HEAD'), name: `Firmware ${version}`, body }),
    });
  }
  if (!rel.ok) fail(`GitHub release: ${rel.status} ${await rel.text()}`);
  const r = await rel.json();
  const old = (r.assets || []).find((a) => a.name === asset);
  if (old) await fetch(`${api}/releases/assets/${old.id}`, { method: 'DELETE', headers: h });
  const up = await fetch(r.upload_url.replace(/\{.*\}$/, `?name=${asset}`), {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/octet-stream' },
    body: bin,
  });
  if (!up.ok) fail(`Upload: ${up.status} ${await up.text()}`);
  console.log(`GitHub Release ${tag}: ${asset} uploaded`);
}
