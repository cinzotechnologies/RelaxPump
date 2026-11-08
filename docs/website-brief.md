# RelaxPump website + admin panel — brief for Claude Code

Read this file, then every file in `reference/website/`, before writing code.
It adds two parts to the RelaxPump monorepo (see the root `CLAUDE.md` for the app, firmware
and Firebase parts, which stay as they are):

- `web/` — the public website **and** the admin panel, one **Next.js** app (App Router,
  TypeScript strict) deployed on **Cloudflare Workers** with the **OpenNext** adapter
  (`@opennextjs/cloudflare`). Public site at `/`, store at `/store`, admin at `/admin`.
- Cloudflare **D1** (SQLite) for content, products, orders and password-reset requests;
  Cloudflare **R2** for images, videos and the manual PDF.

Firebase stays the backend of the **app** (Auth + Realtime Database). The website does not
replace it; it only talks to Firebase Auth for password resets (§7).

---

## 1. Design source — build it exactly like this

| File | What |
|---|---|
| `reference/website/Main.dc.html` | **Home page.** Every section, size, colour, animation and the phone layout. |
| `reference/website/Shop.dc.html` | **Store page** with cart drawer and checkout (ordering still closed). |
| `reference/website/AppScreen.dc.html` | The 6 app screens shown inside the site (Welcome, Home, Tanks, Usage, Bluetooth setup, Account). |
| `reference/website/Admin.dc.html` | **Admin panel**: sidebar, Dashboard, Website content editor, Media, Password requests. |
| `reference/website/AdminLogin.dc.html` | Admin sign-in screen. |
| `reference/website/assets/hero-water.jpg` | Hero / video poster photo. Move to R2 later; ship it in `web/public` first. |

The `.dc.html` format is the same as `reference/design/*.dc.html`: HTML with inline styles,
CSS in `<helmet><style>`, `{{holes}}` filled by `renderVals()` in the `<script>` at the
bottom, `<sc-if>` / `<sc-for>` for conditions and lists, `<dc-import name="AppScreen">` to
mount another file. **Read the markup for layout and the script for behaviour and state.**
Some CSS rules in `Main.dc.html` belong to removed sections (e.g. `.scene`, `.water`,
`.sp`, `.bk`): ignore any class that no markup uses.

**Phone layout:** there are no separate phone files. Every page is one fluid layout that
switches at container widths **≤ 1100 px** and **≤ 820 px** (`@container site (...)` in the
CSS). Use the same breakpoints (container queries or media queries) so a 390 px phone looks
exactly like the 390-wide frames in the design.

### Theme (light, teal) — put these in one tokens file, no hard-coded colours elsewhere

| Token | Value | Use |
|---|---|---|
| ink | `#021A20` | text, footer background |
| teal | `#035360` | primary text on buttons, outlines, icons |
| teal-2 | `#037788` | accents, kicker text, "Relax" in the wordmark |
| glow | `#7FE3EC` | highlights on dark backgrounds |
| muted | `#48656A` | secondary text |
| line | `#CFE3E7` / `#BFD7DB` | card and bar borders |
| tint | `#F3F9FA`, `#E3F5F7`, `#E6F4F6` | section backgrounds, selected states |
| warning | `#F59E0B` | "soon" chips, cart count |
| white | `#FFFFFF` | page background, all buttons |

Fonts: **Outfit** (headings, wordmark) and **Inter** (everything else) — use `next/font/google`.

### Button and icon rules (the client was explicit)
- **Every button and icon button is white with a thin 1 px teal outline** (`#035360`), teal text/icon.
  Hero buttons: 48 px tall, glass white (`rgba(255,255,255,.88)` + blur), 1 px ink outline, **no icons**.
- **No shadows under buttons, no colour swap on hover or click.** Press feedback is
  `transform: scale(.96)` only. Selected chips/tabs get a light tint (`#E6F4F6`) and a teal outline.
- Cards (products, chapters, admin cards) have a visible 1–1.5 px border so a box reads as a box.
- Top bar: **white**, with a 1 px bottom border and a soft shadow so its edge is visible.

### Motion — must feel smooth, high FPS, zero click delay
- Animate **only `transform` and `opacity`** (plus `clip-path` where the design does).
  `will-change: transform` on moving cards. No layout animation.
- `touch-action: manipulation` on every button (kills the 300 ms tap delay); state updates on
  `onClick` immediately — never wait for a timer before changing the UI.
- Easing `cubic-bezier(.22,1,.36,1)`; page flip `cubic-bezier(.645,.045,.355,1)`, 1.15 s.
- Respect `prefers-reduced-motion`.
- Use client components only where there is state (carousels, book, cart, admin); keep the
  rest server components. Lighthouse target: Performance ≥ 90 on mobile.

---

## 2. Home page sections (in order, `Main.dc.html`)

1. **Top bar** — logo + "RelaxPump" wordmark, links (How it works, App, Guide, Download,
   Store, Contact), "Get the app" button. Phone: burger → dropdown menu (Home first).
2. **Hero** — 16:9, `max-height: calc(100vh - 76px)`, min 600 px. Photo at the bottom
   (72 % height, slow zoom-in 20 s), white fade from the top and the left. Left-aligned text:
   "Smart water tank / *automation*", one sub line, two buttons (Get the app, Order the kit),
   three small chips. Phone: min-height 760, buttons full width.
3. **How it works** — 4 slides, auto-advance every 6 s (timer resets on click), tabs with a
   progress bar, prev/next. Right panel wipes in with `clip-path`, phone mockup slides and
   rotates in, big outlined number. Text sits right above the tabs.
4. **App screens** — coverflow of the 6 `AppScreen` mockups, chips + arrows, looped.
5. **Install guide** — 16:9 video player (poster, play button with ring, chapter chip,
   "VIDEO SOON" badge, 5-segment progress) + 5 chapter buttons. Until a video exists, play shows
   "Video coming soon".
6. **Manual** — a real open **book**: hardcover board, page stack, spine shading, landscape
   pages (text left, drawing right). Leaves turn around the spine (`rotateY(-180deg)`,
   `backface-visibility: hidden`), click the right page to go forward, left page to go back.
   Phone: one page at a time, the page peels away to the left. Content is in the script (`PG`).
7. **Download** — teal gradient card, Google Play / App Store badges with "SOON".
   Use the **official** badge artwork from Google and Apple when the apps go live.
8. **Store teaser** — 3 product cards + "Open the store".
9. **Footer (dark)** — Chhinlung Zofa Technologies Private Limited, **+91 98632 62589**
   (`tel:`), **cinzotechnologies@gmail.com** (`mailto:`), **Chala Road, Luangmual**,
   **cinzotechnologies.com**, "Developed by CINZO", © year.

Store page (`Shop.dc.html`): category chips, product grid, add-to-cart steppers, cart drawer
(slides in), checkout form (name, phone, address, town, PIN, Cash on delivery / UPI). "Place
order" stays **disabled** while `ordering_open = false` (admin switch); the note tells people to
call. Cart lives in `localStorage`.

All text, links, images, video, products and contact info must come from **D1 content**
(§4) with the design's copy as the seed data — the admin panel edits them.

---

## 3. Admin panel (`/admin`, `Admin.dc.html`)

- **Sign-in:** protect `/admin/*` and `/api/admin/*` with **Cloudflare Access** (Zero Trust, free
  for small teams, email one-time PIN) — no passwords stored by us. Verify the
  `Cf-Access-Jwt-Assertion` header in the Worker. Show the `AdminLogin` design only as the
  local-dev fallback. Allowed emails come from an env var.
- **Sidebar (left):** Dashboard, Website, Media, Password requests (badge = waiting count),
  View website, Sign out, signed-in admin. Phone: sidebar becomes a horizontal top strip.
- **Dashboard:** 4 stat cards (requests waiting, website sections, last published, online
  ordering open/closed), waiting requests list, quick-edit tiles.
- **Website:** section list (Hero, How it works, App screens, Install video, Manual, App
  download, Store, Contact info) + editor. Field types: text, textarea, link, toggle, image
  upload (preview), video upload or YouTube link, PDF upload. "Unsaved changes" indicator,
  **Discard** and **Publish**. Edits are saved as a draft; Publish copies draft → published and
  purges the page cache (`revalidatePath`).
- **Media:** grid of everything in R2, upload (images, video, PDF), shows where each file is used.
- **Password requests:** see §7.

Every admin action writes a row to `audit_log`.

---

## 4. Data (D1) — migrations in `web/migrations/`, typed queries (Drizzle ORM)

```
content(section TEXT, key TEXT, draft TEXT, published TEXT, updated_at INTEGER,
        PRIMARY KEY(section, key))                      -- JSON values per field
products(id TEXT PK, name, category, price INTEGER NULL, tag, image_key NULL,
         visible INTEGER, sort INTEGER)
media(id TEXT PK, r2_key, name, type, size, used_in TEXT NULL, created_at)
orders(id TEXT PK, name, phone, address, town, pin, payment, items TEXT,
       status TEXT, created_at)                         -- used once ordering opens
reset_requests(id TEXT PK, name, phone, created_at, status TEXT,   -- 'waiting'|'done'
               handled_by NULL, handled_at NULL)
settings(key TEXT PK, value TEXT)                       -- ordering_open, etc.
audit_log(id INTEGER PK, who, action, detail, at)
```

Seed every table from the design copy (`web/migrations/0002_seed.sql`).
R2 bucket `relaxpump-media`; serve files through `/media/<key>` with long cache headers.

---

## 5. Repo layout

```
web/
  app/(site)/page.tsx, store/page.tsx      public pages
  app/admin/...                            admin pages
  app/api/reset-requests/route.ts          public: app → new request
  app/api/admin/...                        admin APIs (Access-protected)
  components/  lib/db.ts  lib/firebase-admin.ts  styles/tokens.ts
  migrations/  public/  wrangler.jsonc  open-next.config.ts
```

Never commit secrets: `.dev.vars`, service-account JSON, `wrangler` tokens. Commit
`.dev.vars.example`. Add `web/.open-next`, `web/.wrangler`, `web/.dev.vars` to `.gitignore`.

---

## 6. Hosting

- `@opennextjs/cloudflare`, `wrangler.jsonc` with `nodejs_compat`, bindings `DB` (D1) and
  `MEDIA` (R2). Scripts: `dev`, `preview` (workerd), `deploy`, `cf-typegen`, `db:migrate`.
- Domain is the client's choice (e.g. `relaxpump.cinzotechnologies.com`); ask before
  touching DNS.
- Write `docs/website-setup.md`: Cloudflare account, `wrangler login`, create D1 + R2,
  run migrations, set secrets, set up Access for `/admin`, deploy, add the domain.

---

## 7. Forgot password → admin → WhatsApp (manual)

1. **App:** change `app/src/features/sheets/ForgotSheet.tsx`. While `ENABLE_PHONE_OTP` is
   false, show name + 10-digit phone fields and a "Send request" button that `POST`s
   `{ name, phone }` to `${WEB_API}/api/reset-requests` (`WEB_API` in `app.config.ts` extra).
   Then show "We will send your new password on WhatsApp." Keep the app's design and theme.
2. **API (public):** validate (10 digits, name ≤ 60 chars), rate-limit (max 3 per phone per
   day, by IP too), store as `waiting`. Never say whether the phone has an account.
3. **Admin → Password requests:** Waiting / Done tabs, list, detail with 3 steps:
   1. **Set a new password** (type or "Generate", 8 chars without look-alike letters) →
      "Save new password" calls `/api/admin/reset-requests/:id/password`, which updates the
      Firebase user `91XXXXXXXXXX@users.relaxpump.app` through the **Identity Toolkit REST API**
      (`accounts:lookup` by email, then `accounts:update` with `localId` + `password`) using a
      Google service-account access token signed in the Worker (`jose`). Works on the Spark
      plan. Service account JSON is a Worker secret. If no user has that phone, say so.
   2. **Open WhatsApp** — `https://wa.me/91<phone>?text=<message>` with the message from the
      design (name, new password, "change it in Account › Change password", "— CINZO").
      Enabled only after step 1 succeeded. The password is never stored in D1.
   3. **Mark as done** → status `done`, `handled_by`, `handled_at`.
4. Old `firebase/scripts/reset-password.mjs` stays as a backup.

---

## 8. How to work

1. Show me a milestone plan first (use a todo list). Suggested order:
   W1 scaffold `web/` (Next.js + OpenNext + D1/R2 bindings, lint, typecheck, tests) →
   W2 tokens + shared components → W3 Home page, matching the design at 1440 and 390 →
   W4 Store page + cart → W5 D1 schema, seed, content loading →
   W6 admin shell + Access + Dashboard → W7 Website editor + Media (R2) + Publish →
   W8 password requests (API, admin, Firebase update, WhatsApp) → W9 app ForgotSheet change →
   W10 docs + deploy.
2. Compare every page with the design side by side (desktop 1440 and phone 390) before you
   call a milestone done. Use Playwright screenshots in `web/tests/visual/`.
3. After each milestone: typecheck, lint, tests, then `git commit` and `git push origin main`.
4. Ask me before anything that costs money, changes Cloudflare/Firebase/DNS, or deletes files.
5. When something needs me (`wrangler login`, Cloudflare dashboard clicks, secrets, domain),
   stop and give short numbered steps.
