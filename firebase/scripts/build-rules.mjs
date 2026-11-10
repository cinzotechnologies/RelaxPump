// Builds database.rules.json from readable pieces. Edit THIS file, then `npm run build:rules`
// (`npm test` and `npm run deploy:rules` run it first).
//
// v2 flexible system: docs/flexible-system.md §5. The installer PIN hash lives in
// installerPins/{id} (never readable) instead of config, because the owner can read the whole
// devices/{id} node and RTDB read rules cannot be taken away further down.
import { writeFileSync } from 'node:fs';

const DEV = `auth != null && auth.token.email === $id.toLowerCase() + '@devices.relaxpump.app' && auth.token.email_verified === true`;
const OWNER = `auth != null && root.child('devices').child($id).child('info/ownerUid').val() === auth.uid`;
const OWNS = (idVar) => `auth != null && root.child('devices').child(${idVar}).child('info/ownerUid').val() === auth.uid`;
const ATTEMPT = (idVar) =>
  `root.child('pinAttempts').child(${idVar}).child(auth.uid).child('hash').val() === root.child('installerPins').child(${idVar}).child('hash').val() && root.child('pinAttempts').child(${idVar}).child(auth.uid).child('ts').val() > now - 900000`;
/** No PIN set yet (first setup), or this user entered the right PIN in the last 15 minutes. */
const PIN = (idVar = '$id') => `(!root.child('installerPins').child(${idVar}).exists() || (${ATTEMPT(idVar)}))`;
const MAX = `root.child('devices').child($id).child('info/maxTanks').val()`;
const IDX =
  `$i.matches(/^[0-7]$/) && ($i === '0'` +
  [1, 2, 3, 4, 5, 6, 7].map((n) => ` || ($i === '${n}' && ${MAX} >= ${n + 1})`).join('') +
  ')';
const HEX64 = `newData.isString() && newData.val().matches(/^[0-9a-f]{64}$/)`;
const num = (lo, hi) => `newData.isNumber() && newData.val() >= ${lo} && newData.val() <= ${hi}`;
const bool = { '.validate': 'newData.isBoolean()' };
const no = { '.validate': false };
const EVENTS = 'full|low|pump_on|pump_off|dry_run|timeout|sensor|phe_on|phe_off|phe_none|main_low|board_error|check_done';

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
          board: { '.write': DEV, '.validate': "newData.isString() && newData.val().matches(/^v[12]$/)" },
          maxTanks: { '.write': DEV, '.validate': num(1, 8) },
          ports: {
            '.write': DEV,
            '.validate': "newData.hasChildren(['sensors', 'valves', 'phe', 'main'])",
            sensors: { '.validate': num(1, 8) },
            valves: { '.validate': num(1, 8) },
            phe: bool,
            main: bool,
            $other: no,
          },
          $other: no,
        },

        state: {
          '.read': DEV,
          '.write': DEV,
          '.validate': "newData.hasChildren(['online', 'pump', 'auto'])",
        },

        config: {
          '.read': DEV,
          // Layout (tanks, sensors, valves, main, PHE, max run) = installer, needs the PIN.
          '.write': `${OWNER} && ${PIN()}`,
          '.validate': "newData.hasChildren(['low', 'high', 'maxRunMin'])",
          // ---- customer fields: owner, no PIN
          low: {
            '.write': OWNER,
            '.validate': `${num(5, 80)} && newData.val() + 10 <= newData.parent().child('high').val()`,
          },
          high: { '.write': OWNER, '.validate': num(20, 100) },
          mode: {
            '.write': `${OWNER} || (${DEV} && !data.exists())`,
            '.validate':
              "newData.isString() && newData.val().matches(/^(auto|phe|pump)$/) && (newData.val() !== 'phe' || newData.parent().child('phe/enabled').val() === true)",
          },
          // ---- installer fields
          maxRunMin: { '.validate': num(5, 180) },
          semi: {
            // The device may write semi/main/phe once, to migrate a v1 config (tankCount + tanks).
            '.write': `${DEV} && !data.exists()`,
            '.validate': "newData.hasChild('0')",
            $i: {
              '.validate': [
                IDX,
                "newData.hasChildren(['sensor', 'valve', 'emptyCm', 'fullCm'])",
                // no sensor → fill by timer
                "(newData.child('sensor').val() === true || newData.child('fillMin').isNumber())",
                // 2+ tanks → every tank has a valve
                "(newData.child('valve').val() === true || ($i === '0' && !newData.parent().child('1').exists()))",
                "($i === '0' || newData.parent().child('0/valve').val() === true)",
              ].join(' && '),
              name: { '.write': OWNER, '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 14' },
              litres: { '.write': OWNER, '.validate': num(0, 999999) },
              sensor: bool,
              valve: bool,
              emptyCm: { '.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= 500' },
              fullCm: { '.validate': num(20, 500) },
              heightFt: { '.validate': num(0, 300) },
              fillMin: { '.validate': num(1, 120) },
              $other: no,
            },
          },
          main: {
            '.write': `${DEV} && !data.exists()`,
            '.validate':
              "newData.hasChildren(['enabled', 'sensor', 'minPct']) && (newData.child('enabled').val() === false || root.child('devices').child($id).child('info/ports/main').val() === true)",
            enabled: bool,
            sensor: bool,
            litres: { '.write': OWNER, '.validate': num(0, 999999) },
            emptyCm: { '.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= 500' },
            fullCm: { '.validate': num(20, 500) },
            minPct: { '.validate': num(5, 40) },
            $other: no,
          },
          phe: {
            '.write': `${DEV} && !data.exists()`,
            '.validate':
              "newData.hasChildren(['enabled', 'probeMin', 'retryMin']) && (newData.child('enabled').val() === false || root.child('devices').child($id).child('info/ports/phe').val() === true)",
            enabled: bool,
            probeMin: { '.validate': num(1, 15) },
            retryMin: { '.validate': num(5, 240) },
            $other: no,
          },
          // ---- v1 shape, still read by old firmware and migrated by v2 firmware
          tankCount: { '.validate': `newData.isNumber() && newData.val() >= 1 && newData.val() <= ${MAX}` },
          tanks: {
            $i: {
              emptyCm: { '.validate': 'newData.isNumber() && newData.val() > 0 && newData.val() <= 500' },
              fullCm: { '.validate': num(20, 500) },
              litres: { '.validate': num(0, 999999) },
              name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 14' },
              $other: no,
            },
          },
          $other: no,
        },

        cmd: {
          '.read': DEV,
          '.write': `auth != null && ((root.child('devices').child($id).child('info/ownerUid').val() === auth.uid && newData.exists()) || (${DEV} && !newData.exists()))`,
          '.validate': "newData.hasChild('ts')",
          pump: bool,
          phe: bool,
          auto: bool,
          pumpCheck: bool,
          valve: {
            '.validate': "newData.hasChildren(['i', 'open'])",
            i: { '.validate': num(0, 7) },
            open: bool,
            $other: no,
          },
          fill: {
            '.validate': "newData.hasChildren(['i', 'src'])",
            i: { '.validate': num(0, 7) },
            src: { '.validate': 'newData.isString() && newData.val().matches(/^(pump|phe)$/)' },
            $other: no,
          },
          test: {
            '.validate': "newData.hasChildren(['port', 'ms'])",
            port: { '.validate': 'newData.isString() && newData.val().matches(/^(V[1-8]|PHE|PUMP)$/)' },
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
            '.validate': "$day.matches(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && newData.hasChildren(['litres', 'pumpMin'])",
          },
        },

        $other: no,
      },
    },
  },
};

writeFileSync(new URL('../database.rules.json', import.meta.url), JSON.stringify(rules, null, 2) + '\n');
console.log('database.rules.json written');
