# RelaxPump v3 (Household + PHE) – Claude Code-a siam dan

Plan kim chu `docs/two-module-system.md` ah a awm a, app screen design thar chu `reference/design-v3/` ah a awm.

- Module 2: **Household** (pump + semi tank 1–5) leh **PHE** (PHE line 1–5, pump a awm lo).
- Module tin hian board leh ESP32 hrang theuh an nei. PCB design leh firmware erawh pakhat a ni.
- App pakhat, account pakhatah board tam tak a register theih. Home-ah Household | PHE tab a awm.
- Firmware update chu app atangin (OTA) a ni ang.

## Tih dan

1. Terminal hawng la:

   ```
   cd D:\RelaxPump-kit
   claude
   ```

2. Folder access a dil chuan **Allow** ti rawh.
3. `V3_START_PROMPT.txt` chhunga thu zawng zawng copy la, Claude Code-ah paste rawh.
4. Milestone plan a lantir hunah en la, "OK, tan rawh" ti rawh.
5. Milestone tin zawhah app hi `reference/design-v3/` nen khaikhin rawh. A danglam chuan file hming sawiin hrilh rawh.
6. Board flash, wiring, signing key siam emaw Firebase/GitHub setting thlak emaw a ngaih hunah step a rawn hrilh ang che.

## Hriat tur

- **Board hlui (tuna kan neih) te:** OTA a thawh theih nan partition thlak a ngai a, chuvangin
  board tin hi **vawi khat USB cable hmangin flash a ngai**. Chumi hnu chuan update zawng zawng chu
  app atangin a kal tawh ang.
- **Signing key** (OTA firmware sign na) hi computer-ah, repo pawnah dah tur a ni. Git-ah commit
  suh. A bo chuan update thar kan thawn thei tawh lo vang, chuvangin backup (pen drive) siam rawh.
- Hardware (Rev C board, relay 8, module thensawm) hi naktuk-ah kan siam ang. Firmware-ah pin
  zawng zawng hi `board.h`-ah a awm a, board thar a lo awm hunah file pakhat chauh thlak a ngai ang.
- **Website** pawh app nen a inmil turin ka siamtha a (Household + PHE, store leh Plan your kit).
  App session a zawh hnuah Claude Code session **thar** hawng la, `WEB_V3_PROMPT.txt` chhunga thu
  chu paste rawh. Cloudflare-ah deploy hmain a zawt ang che.
