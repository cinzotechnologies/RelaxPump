# RelaxPump website + admin panel

Next.js (App Router) on Cloudflare Workers via OpenNext, with D1 (data) and R2 (media).
Spec: [`docs/website-brief.md`](../docs/website-brief.md). Designs: [`reference/website/`](../reference/website/).

| Command               | What                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `npm run dev`         | Next dev server with local D1/R2 (Miniflare, state in `.wrangler/`) |
| `npm run preview`     | Build for Workers and run it in workerd locally                     |
| `npm run deploy`      | Build and deploy to Cloudflare                                      |
| `npm run db:migrate`  | Apply `migrations/` to the local D1 (`:remote` for production)      |
| `npm run check`       | Typecheck, lint, unit tests                                         |
| `npm run test:visual` | Playwright screenshots at 1440 and 390                              |
| `npm run cf-typegen`  | Regenerate `cloudflare-env.d.ts` after changing `wrangler.jsonc`    |

Copy `.dev.vars.example` to `.dev.vars` for local secrets. Never commit `.dev.vars`.
