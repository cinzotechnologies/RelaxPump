# RelaxPump website leh admin panel – Claude Code-a siam dan

Design zawng zawng hi `reference/website/` ah a awm a, thupek kim chu `docs/website-brief.md` ah a awm.

## A hma lama buatsaih tur (vawi khat chauh)

1. **Node.js 22** leh **Git** install a ni tawh tur a ni (app siam laia i install tawh kha).
2. **Cloudflare account** siam rawh: https://dash.cloudflare.com/sign-up (a free).
3. Repo thar ber la lut rawh. Terminal-ah:

   ```
   cd D:\RelaxPump-kit
   git pull origin main
   ```

## Claude Code tan dan

1. Terminal-ah repo folder-ah lut la, Claude Code tan rawh:

   ```
   cd D:\RelaxPump-kit
   claude
   ```

   (Folder hi **repo pumpui** (`RelaxPump-kit`) ni se, `web` folder chauh ni suh. Chutiang chuan
   app, firmware, Firebase leh design zawng zawng a hmu thei ang.)

2. Folder access a dil chuan **Yes / Allow** ti rawh.
3. `WEB_START_PROMPT.txt` chhunga thu zawng zawng hi copy la, Claude Code-ah paste rawh.
4. Milestone plan a rawn lantir hunah en la, "OK, tan rawh" ti rawh.
5. Milestone khat a zawh apiangin screenshot (desktop leh phone) en la, design nen khaikhin rawh.
   A danglam chuan "Hero hi design ang chiah a ni lo, Main.dc.html en leh la siam tha rawh" tiin hrilh rawh.
6. Cloudflare (`wrangler login`, D1, R2, Access, domain) emaw Firebase service account emaw
   a ngaih hunah step tawi tein a hrilh ang che — a sawi ang zelin ti rawh.

## Thil pawimawh

- **Secret** (Firebase service account JSON, `.dev.vars`, Cloudflare token) hi push suh. Repo hi public a ni.
- Hero thlalak (`hero-water.jpg`) hi i thlalak a ni a, repo public-ah a awm tawh. A copyright i neih ngei em tih en rawh.
- Website hi design ang chiah a chhuah loh chuan Claude Code hnenah file hming leh section hming sawiin
  ("Main.dc.html-a Manual book ang chiah hian siam rawh") hrilh rawh.
- Admin panel-ah forgot password request lo lut te hi: password thar siam → WhatsApp-ah thawn → Mark as done.
