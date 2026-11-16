// Factory USB flash of one board: bootloader + partition table (two OTA slots) + the release
// firmware (no secrets inside) + this board's NVS image (id, password, claim code, type, board).
// Run `npm run new-device` first; it writes firebase/out/<ID>/nvs.csv.
//
//   npm run factory-flash -- --id RP-3F2A9C --port COM5
//   npm run factory-flash -- --id RP-3F2A9C --port COM5 --env revc        # Rev C (8 MB flash)
//   npm run factory-flash -- --id RP-D11C2C --port COM5 --type household --board v1
//        (boards made before v3 have no nvs.csv: it is built from out/<ID>/device.json)
//   --no-build   flash what is already in firmware/.pio/build/<env>/
//   --dry-run    build + write nvs.bin, print the esptool command, flash nothing
//
// The whole NVS partition is replaced, so the board forgets its Wi-Fi: set it up again over
// Bluetooth from the app (Add device). Needs PlatformIO (pio) installed in the usual place.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { arg } from './_admin.mjs';
import { nvsImage, parseNvsCsv } from './nvs-image.mjs';

const has = (f) => process.argv.includes(`--${f}`);
const id = (arg('id') || '').toUpperCase();
if (!/^RP-[0-9A-F]{6}$/.test(id)) fail('--id RP-XXXXXX is required');
const env = arg('env', 'release');
if (env !== 'release' && env !== 'revc') fail('--env must be release (4 MB DevKit) or revc (8 MB Rev C)');
const port = arg('port');
const dry = has('dry-run');
if (!port && !dry) fail('--port COMx is required (Device Manager → Ports), or use --dry-run');

const repo = fileURLToPath(new URL('../../', import.meta.url));
const fwDir = join(repo, 'firmware');
const outDir = join(repo, 'firebase', 'out', id);
const pio = join(homedir(), '.platformio', 'penv', process.platform === 'win32' ? 'Scripts' : 'bin');
const python = join(pio, process.platform === 'win32' ? 'python.exe' : 'python');
const pioExe = join(pio, process.platform === 'win32' ? 'pio.exe' : 'pio');
const esptool = join(homedir(), '.platformio', 'packages', 'tool-esptoolpy', 'esptool.py');
const bootApp0 = join(
  homedir(),
  '.platformio',
  'packages',
  'framework-arduinoespressif32',
  'tools',
  'partitions',
  'boot_app0.bin',
);
for (const f of [python, esptool, bootApp0]) if (!existsSync(f)) fail(`not found: ${f} (install PlatformIO and build once)`);

// ---- NVS values
const csvPath = join(outDir, 'nvs.csv');
let rows;
if (existsSync(csvPath)) {
  rows = parseNvsCsv(readFileSync(csvPath, 'utf8'));
} else if (existsSync(join(outDir, 'device.json'))) {
  const d = JSON.parse(readFileSync(join(outDir, 'device.json'), 'utf8'));
  const type = arg('type', d.type);
  const board = arg('board', d.board);
  if (!/^(household|phe)$/.test(type || '')) fail(`${id} has no nvs.csv: pass --type household|phe (must match the app/DB)`);
  if (!/^v[123]$/.test(board || '')) fail(`${id} has no nvs.csv: pass --board v1|v2|v3`);
  rows = [
    ['id', d.id],
    ['email', `${d.id.toLowerCase()}@devices.relaxpump.app`],
    ['pass', d.password],
    ['claim', d.code],
    ['pop', d.pop || d.code],
    ['type', type],
  ].map(([key, value]) => ({ ns: 'rpid', key, type: 'string', value }));
  rows.push({ ns: 'rp', key: 'board', type: 'i32', value: Number(board.slice(1)) });
  writeFileSync(csvPath, ['key,type,encoding,value', 'rpid,namespace,,', ...rows.slice(0, 6).map((r) => `${r.key},data,string,${r.value}`), 'rp,namespace,,', `board,data,i32,${board.slice(1)}`, ''].join('\n'));
  console.log(`nvs.csv written from device.json (${type}, board ${board})`);
} else fail(`firebase/out/${id}/ not found: run npm run new-device -- --id ${id} first`);

const get = (k) => rows.find((r) => r.ns === 'rpid' && r.key === k)?.value;
if (get('id') !== id) fail(`nvs.csv belongs to ${get('id')}, not ${id}`);
for (const k of ['pass', 'claim', 'type']) if (!get(k)) fail(`nvs.csv has no ${k}`);

// ---- partition layout of this env (nvs offset/size, from the CSV the build uses)
const ini = readFileSync(join(fwDir, 'platformio.ini'), 'utf8');
const partsName = env === 'revc' ? 'partitions/rp_8mb.csv' : (/board_build\.partitions\s*=\s*(\S+)/.exec(ini) || [])[1];
const partsFile = existsSync(join(fwDir, partsName))
  ? join(fwDir, partsName)
  : join(homedir(), '.platformio', 'packages', 'framework-arduinoespressif32', 'tools', 'partitions', partsName);
const nvsLine = readFileSync(partsFile, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.split(',').map((s) => s.trim()))
  .find((c) => c[0] === 'nvs');
if (!nvsLine) fail(`no nvs partition in ${partsFile}`);
const nvsOffset = Number(nvsLine[3]);
const nvsSize = Number(nvsLine[4]);

const nvsBin = join(outDir, 'nvs.bin');
writeFileSync(nvsBin, nvsImage(rows, nvsSize));
console.log(`NVS image: ${nvsBin} (${nvsSize} bytes at 0x${nvsOffset.toString(16)}, ${get('type')})`);

// ---- firmware
if (!has('no-build')) {
  if (!existsSync(join(fwDir, 'include', 'project.h'))) fail('firmware/include/project.h missing: node firmware/scripts/make-project-h.mjs');
  console.log(`Building env:${env} …`);
  execFileSync(pioExe, ['run', '-e', env], { cwd: fwDir, stdio: 'inherit' });
}
const build = join(fwDir, '.pio', 'build', env);
const images = [
  ['0x1000', join(build, 'bootloader.bin')],
  ['0x8000', join(build, 'partitions.bin')],
  [`0x${nvsOffset.toString(16)}`, nvsBin],
  ['0xe000', bootApp0], // otadata: boot app0
  ['0x10000', join(build, 'firmware.bin')],
];
for (const [, f] of images) if (!existsSync(f)) fail(`not found: ${f} (build env:${env} first)`);

const args = [esptool, '--chip', 'esp32', '--port', port || 'COMx', '--baud', '460800', '--before', 'default_reset', '--after', 'hard_reset', 'write_flash', '-z', '--flash_mode', 'dio', '--flash_freq', '40m', '--flash_size', 'detect', ...images.flat()];
if (dry) {
  console.log(`\nDry run. Would run:\n${python} ${args.join(' ')}`);
  process.exit(0);
}
console.log(`Flashing ${id} on ${port} (hold BOOT if it does not connect) …`);
execFileSync(python, args, { stdio: 'inherit' });
console.log(`\nDone. ${id} restarts as ${get('type') === 'phe' ? 'RelaxPump-P' : 'RelaxPump-H'}-${id.slice(-4)} and waits for Bluetooth setup.`);
console.log('Check: pio device monitor -b 115200, type id + Enter → it shows the id, type and flash size.');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
