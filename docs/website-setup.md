# RelaxPump website — setup and deploy

One Cloudflare Worker (`web/`, Next.js + OpenNext) serves two hostnames:

| Host | What |
|---|---|
| `relaxpump.cinzotechnologies.com` | Public site (home, store, `/media/*`, `/api/reset-requests` for the app) |
| `relaxpumpadmin.cinzotechnologies.com` | Admin panel only, behind Cloudflare Access (email one-time PIN) |

Data: **D1** `relaxpump-web` (content, products, orders, reset requests, audit log) and **R2**
`relaxpump-media` (uploads). App users stay in **Firebase** (`iotcinzo`); the admin changes
their passwords through the Identity Toolkit REST API. No other backend (no Supabase).

The Cloudflare account can hold other projects too (e.g. Renco). Free limits are per account
and shared by all its projects; one Workers Paid plan ($5/month) later covers every Worker in
the account, and D1/R2 usage is billed per account.

All commands run in `web/`.

## 1. Cloudflare account

1. `npx wrangler login` (once) and check with `npx wrangler whoami`.
2. The domain `cinzotechnologies.com` must be a zone in **this** account (Websites list in the
   dashboard). If it is not, add it there first — changing nameservers moves its DNS (and
   email records) to Cloudflare, so copy every existing record.

## 2. R2 (needs a payment method on the account, free tier 10 GB)

1. Dashboard → **R2 Object Storage** → enable (add a card if asked; nothing is charged inside
   the free tier).
2. `npx wrangler r2 bucket create relaxpump-media`

## 3. D1

1. `npx wrangler d1 create relaxpump-web` → copy `database_id` into `wrangler.jsonc`.
2. `npm run db:migrate:remote` (tables + the design copy as seed).

## 4. Secrets

```sh
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT   # paste the service-account JSON on one line
```

Get the JSON from Firebase console → Project settings → Service accounts → Generate new private
key (or the existing `D:\keys\iotcinzo-admin.json`). Make it one line, e.g.
`node -e "process.stdout.write(JSON.stringify(require('D:/keys/iotcinzo-admin.json')))"`.

## 5. Cloudflare Access for the admin host

1. Dashboard → **Zero Trust** (pick the Free plan if asked; choose a team name, e.g. `cinzo`).
2. Settings → Authentication → add **One-time PIN**.
3. Access → Applications → **Add → Self-hosted**:
   - Domain: `relaxpumpadmin.cinzotechnologies.com` (whole host, no path)
   - Policy: Allow → Emails → the admin emails (same as `ADMIN_EMAILS` in `wrangler.jsonc`)
4. Copy the application's **AUD tag**, then:

```sh
npx wrangler secret put ACCESS_TEAM_DOMAIN   # e.g. cinzo.cloudflareaccess.com
npx wrangler secret put ACCESS_AUD           # the AUD tag
```

The Worker re-checks the Access JWT and the email list on every admin request; on the public
host `/admin` is a 404.

## 6. Deploy

```sh
npm run deploy
```

`routes` in `wrangler.jsonc` attach both hostnames as Custom Domains (DNS + certificate are
created by Cloudflare). Check:

- `https://relaxpump.cinzotechnologies.com` — home and store
- `https://relaxpump.cinzotechnologies.com/admin` — 404
- `https://relaxpumpadmin.cinzotechnologies.com` — Access PIN screen, then the dashboard

## 7. After the first deploy

- Admin → Media: upload real photos/video/PDF; Website → Publish.
- App: `WEB_API` in `app/app.config.ts` is `https://relaxpump.cinzotechnologies.com`; publish
  an app update only after the site is live (Forgot password posts there).
- Test a password reset with a test account (Admin → Password requests).

## Local development

`npm run dev` (http://localhost:3000). On localhost the two hostnames are ignored, the admin is
at `/admin` with the dev sign-in (`/admin/login`, emails from `ADMIN_EMAILS`), and D1/R2 are
local (`.wrangler/`). `npm run db:migrate` sets up the local database. `.dev.vars` (git-ignored)
may hold `FIREBASE_SERVICE_ACCOUNT` to test real resets — that changes real users' passwords.

Checks: `npm run check` (types, lint, unit) and `npx playwright test` (visual + flows).
