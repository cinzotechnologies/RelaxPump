// Builds database.rules.json from readable pieces. Edit THIS file, then `npm run build:rules`
// (`npm test` and `npm run deploy:rules` run it first).
//
// v2 customizable system (docs/flexible-system.md §3): 1–5 semi tanks (sensor + valve each; one
// tank = sensor only), optional main-tank sensor.
// v3 (docs/two-module-system.md §3): two module types, set at the factory in info/type —
// 'household' (pump + 1–5 semi tanks, as v2; a missing type means household) and 'phe' (1–5 PHE
// lines, sensor + valve each, no pump). Config, commands and usage are checked against the type.
// OTA: firmware/stable (admin only) + cmd.ota whose version must equal firmware/stable/version. The installer PIN hash lives in
// installerPins/{id} (never readable) instead of config.installerPinHash: the owner can read the
// whole devices/{id} node (RTDB read rules cannot be taken away further down), and a readable
// 4-digit PIN hash is cracked in seconds.
import { writeFileSync } from 'node:fs';

const DEV = `auth != null && auth.token.email === $id.toLowerCase() + '@devices.relaxpump.app' && auth.token.email_verified === true`;
const OWNER = `auth != null && root.child('devices').child($id).child('info/ownerUid').val() === auth.uid`;
const OWNS = (idVar) => `auth != null && root.child('devices').child(${idVar}).child('info/ownerUid').val() === auth.uid`;
const ATTEMPT = (idVar) =>
  `root.child('pinAttempts').child(${idVar}).child(auth.uid).child('hash').val() === root.child('installerPins').child(${idVar}).child('hash').val() && root.child('pinAttempts').child(${idVar}).child(auth.uid).child('ts').val() > now - 900000`;
/** No PIN set yet (first setup), or this user entered the right PIN in the last 15 minutes. */
const PIN = (idVar = '$id') => `(!root.child('installerPins').child(${idVar}).exists() || (${ATTEMPT(idVar)}))`;

const MAX_TANKS = 5;
/** This device is a PHE module (info/type, written once by the device or new-device). */
const IS_PHE = `root.child('devices').child($id).child('info/type').val() === 'phe'`;
const NOT_PHE = `!(${IS_PHE})`;
const VERSION = '/^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$/';
/** config/tanks/$i: 0..4 and below the tankCount being written. */
const TC = `newData.parent().parent().child('tankCount').val()`;
const IDX =
  `$i.matches(/^[0-4]$/) && ($i === '0'` +
  [1, 2, 3, 4].map((n) => ` || ($i === '${n}' && ${TC} >= ${n + 1})`).join('') +
  ')';
/** config: tankCount = n → tanks 0..n-1 all exist (IDX forbids the rest). */
const LEN =
  `newData.child('tanks/0').exists()` +
  [1, 2, 3, 4]
    .map((n) => ` && (newData.child('tankCount').val() <= ${n} || newData.child('tanks/${n}').exists())`)
    .join('');

const HEX64 = `newData.isString() && newData.val().matches(/^[0-9a-f]{64}$/)`;
const num = (lo, hi) => `newData.isNumber() && newData.val() >= ${lo} && newData.val() <= ${hi}`;
const bool = { '.validate': 'newData.isBoolean()' };
const no = { '.validate': false };
const NAME = { '.write': OWNER, '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 14' };
const EVENTS =
  'full|low|pump_on|pump_off|dry_run|timeout|sensor|main_low|board_error|check_done' +
  '|flow_start|flow_stop|phe_full|overflow|ota_done|ota_failed';
const OTA_PHASES = 'download|verify|install|restart|done|failed';

const rules = {
  rules: {
    '.read': false,
    '.write': false,

    users: {
      $uid: {
        '.read': 'auth != null && auth.uid === $uid',
        '.write': 'auth != null && auth.uid === $uid',
        '.validate': "newData.hasChildren(['name', 'phone'])",
        name: { '.validate': 'newData.isString() && newData.val().length <= 40' },
        phone: { '.validate': 'newData.isString() && newData.val().matches(/^[0-9]{10}$/)' },
        createdAt: { '.validate': 'newData.isNumber()' },
        devices: {
          $deviceId: {
            '.validate':
              "newData.val() === true && newData.parent().parent().parent().parent().child('devices').child($deviceId).child('info/ownerUid').val() === auth.uid",
          },
        },
        fcm: { $token: { '.validate': 'newData.val() === true && $token.length <= 300' } },
        $other: no,
      },
    },

    claims: { '.read': false, '.write': false },

    // OTA release channel. Written by firmware/scripts/release.mjs with the admin key (rules
    // bypassed); every signed-in user and every device may read it.
    firmware: {
      stable: {
        '.read': 'auth != null',
        '.write': false,
        '.validate': "newData.hasChildren(['version', 'url', 'sha256', 'sig', 'size', 'minFw', 'rollout'])",
        version: { '.validate': `newData.isString() && newData.val().matches(${VERSION})` },
        url: { '.validate': "newData.isString() && newData.val().beginsWith('https://')" },
        sha256: { '.validate': HEX64 },
        sig: { '.validate': 'newData.isString() && newData.val().length <= 200' },
        size: { '.validate': 'newData.isNumber() && newData.val() > 0' },
        minFw: { '.validate': `newData.isString() && newData.val().matches(${VERSION})` },
        rollout: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100' },
        date: { '.validate': 'newData.isString()' },
        notes: { $n: { '.validate': 'newData.isString() && newData.val().length <= 120' } },
        $other: no,
      },
    },

    claimAttempts: {
      $deviceId: {
        $uid: {
          '.read': false,
          '.write': 'auth != null && auth.uid === $uid',
          '.validate': HEX64,
        },
      },
    },

    // Installer PIN: sha256("<deviceId>:pin:<4 digits>"). Never readable. The owner sets it on the
    // first setup; changing it needs the old PIN. "Forgot PIN" → CINZO runs scripts/reset-pin.mjs.
    installerPins: {
      $id: {
        '.read': false,
        '.write': `newData.exists() && ${OWNER} && ${PIN()}`,
        '.validate': "newData.hasChildren(['hash'])",
        hash: { '.validate': HEX64 },
        $other: no,
      },
    },
    pinAttempts: {
      $deviceId: {
        $uid: {
          '.read': false,
          '.write': 'auth != null && auth.uid === $uid',
          '.validate': "newData.hasChildren(['hash', 'ts'])",
          hash: { '.validate': HEX64 },
          ts: { '.validate': 'newData.isNumber() && newData.val() <= now + 60000 && newData.val() >= now - 60000' },
          $other: no,
        },
      },
    },
    // The app writes here right after a pinAttempt: success means the PIN was right.
    pinChecks: {
      $deviceId: {
        $uid: {
          '.read': 'auth != null && auth.uid === $uid',
          '.write': `auth != null && auth.uid === $uid && ${OWNS('$deviceId')} && (!newData.exists() || ${PIN('$deviceId')})`,
          '.validate': 'newData.isNumber()',
        },
      },
    },

    devices: {
      $id: {
        '.read': OWNER,

        info: {
          '.read': DEV,
          ownerUid: {
            '.write':
              "auth != null && ((!data.exists() && newData.val() === auth.uid && root.child('claims').child($id).child('codeHash').exists() && newData.parent().parent().parent().parent().child('claimAttempts').child($id).child(auth.uid).val() === root.child('claims').child($id).child('codeHash').val()) || (data.val() === auth.uid && !newData.exists()))",
            '.validate': 'newData.isString()',
          },
          name: { '.validate': 'newData.isString() && newData.val().length <= 40' },
          fw: { '.write': DEV, '.validate': 'newData.isString() && newData.val().length <= 20' },
          // Label only (v1 = hand-wired board, v2 = PCB); both use the same pins.
          // v3 = Rev C board (ULN driver).
          board: { '.write': DEV, '.validate': "newData.isString() && newData.val().matches(/^v[123]$/)" },
          maxTanks: { '.write': DEV, '.validate': num(1, MAX_TANKS) },
          // Module type, set at the factory. Written once (new-device or the board's first report).
          type: {
            '.write': DEV,
            '.validate':
              "newData.isString() && newData.val().matches(/^(household|phe)$/) && (!data.exists() || data.val() === newData.val())",
          },
          // Flash size in MB (4 = today's DevKit, 8 = Rev C module).
          flash: {
            '.write': DEV,
            '.validate': 'newData.isNumber() && (newData.val() === 4 || newData.val() === 8 || newData.val() === 16)',
          },
          $other: no,
        },

        state: {
          '.read': DEV,
          '.write': DEV,
          // PHE has no pump; household state still reports it.
          '.validate': `newData.hasChildren(['online', 'auto']) && (${IS_PHE} || newData.hasChild('pump'))`,
          fwAvailable: { '.validate': `newData.isString() && newData.val().matches(${VERSION})` },
          supply: { '.validate': "newData.isString() && newData.val().matches(/^(flowing|none|unknown)$/)" },
          ota: {
            '.validate': "newData.hasChildren(['phase'])",
            phase: { '.validate': `newData.isString() && newData.val().matches(/^(${OTA_PHASES})$/)` },
            pct: { '.validate': num(0, 100) },
            to: { '.validate': `newData.isString() && newData.val().matches(${VERSION})` },
            err: { '.validate': 'newData.isString() && newData.val().length <= 80' },
            $other: no,
          },
        },

        config: {
          '.read': DEV,
          // Layout (tank count, sensor distances, heights, main tank, max run) = installer, PIN.
          '.write': `${OWNER} && ${PIN()}`,
          // household: tankCount, tanks, low, high, maxRunMin (+ main). phe: tankCount, tanks, low, high.
          '.validate': `newData.hasChildren(['tankCount', 'tanks', 'low', 'high']) && (${IS_PHE} || newData.hasChild('maxRunMin')) && ${LEN}`,
          // ---- customer fields: owner, no PIN (also tanks/$i/name|litres, main/litres)
          // household: Start below 5–80 %, Stop at 20–100 %, at least 10 apart.
          // phe: reopen below 50–95 % (default 85), close at 60–100 % (default 95), at least 5 apart.
          low: {
            '.write': OWNER,
            '.validate': `(${IS_PHE}) ? (${num(50, 95)} && newData.val() + 5 <= newData.parent().child('high').val()) : (${num(5, 80)} && newData.val() + 10 <= newData.parent().child('high').val())`,
          },
          high: { '.write': OWNER, '.validate': `(${IS_PHE}) ? (${num(60, 100)}) : (${num(20, 100)})` },
          // ---- installer fields (household only)
          maxRunMin: { '.validate': `${NOT_PHE} && ${num(5, 180)}` },
          // Never more tanks than the firmware reports (old 3-tank firmware: maxTanks 3).
          tankCount: {
            '.validate': `${num(1, MAX_TANKS)} && newData.val() <= root.child('devices').child($id).child('info/maxTanks').val()`,
          },
          tanks: {
            $i: {
              '.validate': `${IDX} && newData.hasChildren(['emptyCm', 'fullCm'])`,
              name: NAME,
              litres: { '.write': OWNER, '.validate': num(0, 999999) },
              emptyCm: { '.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= 500' },
              fullCm: { '.validate': num(20, 500) },
              heightFt: { '.validate': `${NOT_PHE} && ${num(0, 300)}` },
              $other: no,
            },
          },
          main: {
            '.validate': `${NOT_PHE} && newData.hasChildren(['enabled', 'minPct'])`,
            enabled: bool,
            litres: { '.write': OWNER, '.validate': num(0, 999999) },
            emptyCm: { '.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= 800' },
            fullCm: { '.validate': num(20, 500) },
            minPct: { '.validate': num(5, 40) },
            $other: no,
          },
          $other: no,
        },

        cmd: {
          '.read': DEV,
          '.write': `auth != null && ((root.child('devices').child($id).child('info/ownerUid').val() === auth.uid && newData.exists()) || (${DEV} && !newData.exists()))`,
          '.validate': "newData.hasChild('ts')",
          // PHE boards have no pump: pump, pumpCheck and test PUMP are refused.
          pump: { '.validate': `newData.isBoolean() && ${NOT_PHE}` },
          auto: bool,
          pumpCheck: { '.validate': `newData.isBoolean() && ${NOT_PHE}` },
          // Over-the-air update to the released version (firmware/stable).
          ota: {
            '.validate': "newData.hasChildren(['version'])",
            version: {
              '.validate': "newData.isString() && newData.val() === root.child('firmware/stable/version').val()",
            },
            $other: no,
          },
          // Firmware 2.3: forget the home Wi-Fi, restart into Bluetooth setup (owner only).
          wifiReset: bool,
          valve: {
            '.validate': "newData.hasChildren(['i', 'open'])",
            i: { '.validate': num(0, MAX_TANKS - 1) },
            open: bool,
            $other: no,
          },
          test: {
            '.validate': "newData.hasChildren(['port', 'ms'])",
            port: {
              '.validate': `newData.isString() && (newData.val().matches(/^V[1-5]$/) || (newData.val() === 'PUMP' && ${NOT_PHE}))`,
            },
            ms: { '.validate': num(100, 3000) },
            $other: no,
          },
          ts: { '.validate': 'newData.isNumber() && newData.val() <= now + 60000' },
          $other: no,
        },

        events: {
          '.indexOn': ['ts'],
          $eventId: {
            '.write': `${DEV} && !data.exists()`,
            '.validate': `newData.hasChildren(['type', 'tank', 'ts']) && newData.child('type').isString() && newData.child('type').val().matches(/^(${EVENTS})$/)`,
          },
        },

        usage: {
          $day: {
            '.write': DEV,
            // household: litres + pumpMin; phe: litres received per line (no pump).
            '.validate': `$day.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && newData.hasChild('litres') && (${IS_PHE} || newData.hasChild('pumpMin'))`,
          },
        },

        $other: no,
      },
    },
  },
};

writeFileSync(new URL('../database.rules.json', import.meta.url), JSON.stringify(rules, null, 2) + '\n');
console.log('database.rules.json written');
