# RelaxPump website — setup and deploy

The same build (`web/`, Next.js + OpenNext) runs as **two Workers** in the CINZO Cloudflare
account (`cinzotechnologies@gmail.com`, id `4e6a5508…`, also home of Renco):

| Worker | URL | What |
|---|---|---|
| `relaxpump` | `https://relaxpump.cinzotechnologies.workers.dev` | Public site, `/media/*`, `/api/reset-requests` (the app) |
| `relaxpumpadmin` | `https://relaxpumpadmin.cinzotechnologies.workers.dev` | Admin only, behind Cloudflare Access |

Both use the same **D1** `relaxpump-web` and **R2** `relaxpump-media`. App users stay in
**Firebase** (`iotcinzo`). No other backend (no Supabase).

Billing: free limits (e.g. 100k Worker requests/day) are per account and shared with Renco; one
Workers Paid plan ($5/month) later covers every Worker in the account.

`cinzotechnologies.com` is in a different Cloudflare account, so custom domains are not used
for now. Moving the domain into this account later lets us add them (`routes` in
`wrangler.jsonc`); the app's `WEB_API` would then need an app update.

All commands run in `web/`.

## 1. Sign in to the right account

```sh
npx wrangler logout
npx wrangler login        # sign in as cinzotechnologies@gmail.com
npx wrangler whoami       # must list account 4e6a5508dbcbc6f1f79f5fd2753995ed
```

`account_id` in `wrangler.jsonc` makes deploys fail rather than go to another account.

## 2. R2 (needs a payment method on the account; free tier 10 GB)

1. Dashboard → **Storage & databases → R2** → enable (add a card if asked; nothing is charged
   inside the free tier).
2. `npx wrangler r2 bucket create relaxpump-media`

## 3. D1

1. `npx wrangler d1 create relaxpump-web` → copy `database_id` into **both** places in
   `wrangler.jsonc` (top level and `env.admin`).
2. `npm run db:migrate:remote`

## 4. First deploy

```sh
npm run deploy      # builds once, deploys relaxpump and relaxpumpadmin
```

## 5. Cloudflare Access on the admin Worker

1. Dashboard → **Zero Trust** → pick the Free plan, choose a team name (e.g. `cinzo`).
2. Zero Trust → Settings → Authentication → add **One-time PIN**.
3. Workers & Pages → `relaxpumpadmin` → Settings → Domains & Routes → `workers.dev` →
   **Enable Cloudflare Access**. Then in Zero Trust → Access → Applications open the new app:
   policy **Allow → Emails** = the admin emails (`ADMIN_EMAILS`), and copy its **AUD tag**.
4. Secrets (admin Worker only):

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN --env admin       # e.g. cinzo.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD --env admin               # the AUD tag
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --env admin # service-account JSON, one line
```

One-line JSON: `node -e "process.stdout.write(JSON.stringify(require('D:/keys/iotcinzo-admin.json')))"`.

The Worker re-checks the Access JWT and the email list on every admin request. On the public
Worker `/admin` is a 404 and admin APIs answer 401.

## 6. Check

- `https://relaxpump.cinzotechnologies.workers.dev` — home and store
- `https://relaxpump.cinzotechnologies.workers.dev/admin` — 404
- `https://relaxpumpadmin.cinzotechnologies.workers.dev` — Access PIN, then the dashboard

## 7. After the first deploy

- Admin → Media: upload real photos / video / PDF; Website → Publish.
- App: `WEB_API` in `app/app.config.ts` is the public URL; publish an app update only after the
  site is live (Forgot password posts there).
- Test a password reset with a test account (Admin → Password requests).

## Local development

`npm run dev` (http://localhost:3000). On localhost the two hostnames are ignored, the admin is
at `/admin` with the dev sign-in (`/admin/login`, emails from `ADMIN_EMAILS`), and D1/R2 are
local (`.wrangler/`). `npm run db:migrate` sets up the local database. `.dev.vars` (git-ignored)
may hold `FIREBASE_SERVICE_ACCOUNT` to test real resets — that changes real users' passwords.

Checks: `npm run check` (types, lint, unit) and `npx playwright test` (visual + flows).
