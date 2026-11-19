# Deployment runbook — Escape60 on Arvan (v3.5.1: SIM 2.2.0 · API 4.1.2)

Live URL: **https://escape60.lavanai2525-3qem7.arvanedge.ir** — API 4.1.2 / SIM 2.2.0 deployed and checked on 2026-11-20. What runs where is explained for judges in [TECHNOLOGY.md](TECHNOLOGY.md); the API is in [06_EDGE_SPEC.md](06_EDGE_SPEC.md).

## راهنمای سریع به‌روزرسانی سرور (از کامپیوتر خودتان)
۰. **پیش از دیپلوی — تست روی کامپیوتر خودتان (۵ دقیقه، توصیه می‌شود):**
   - `git pull` و بعد `npm ci` (دقیقاً همان نسخه‌ی ابزارهای قفل‌شده).
   - `npm run check` ← باید «۳۱ تست پاس» و `Syntax OK` ببینید.
   - `npm run build && npm run edge:local` ← همان فایل Edge که آپلود می‌شود روی http://localhost:4174 اجرا می‌شود. در مرورگر بازش کنید و یک دور بازی کنید (چک‌لیست «بعد از دیپلوی» پایین را همین‌جا هم می‌شود دید).
   - اختیاری، تست خودکار مرورگر: در ترمینال دوم `GAME_URL=http://localhost:4174 npm run test:browser`. این تست به کروم نیاز دارد: اگر پیدا نکرد، مسیرش را بدهید، مثلاً ویندوز `set CHROME_BIN=C:\Program Files\Google\Chrome\Application\chrome.exe` و مک `CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`. آخرش باید `smoke OK` بنویسد. (در ویندوز متغیرها را جدا بدهید: `set GAME_URL=http://localhost:4174` و بعد `npm run test:browser`.)
   - **پشتیبان برای برگشت:** قبل از دیپلوی، در پنل Edge ← `escape60` ← ویرایش کد، کل کد فعلی را در یک فایل (مثلاً `edge-backup.js`) ذخیره کنید، و صفحه‌ی فعلی را هم نگه دارید: `curl -o index-backup.html https://escape60.lavanai2525-3qem7.arvanedge.ir/` (پایین «برگشت به نسخه‌ی قبل» را ببینید).
۱. **یک بار:** Node.js نسخه‌ی ۲۰ یا بالاتر نصب باشد. ریپو را بگیرید: `git clone https://github.com/ar-karkon/Escape60.git` (اگر قبلاً دارید: `git pull`) و داخل پوشه `npm install` بزنید.
۲. **متغیرهای Edge را چک کنید** (پنل آروان ← Edge Computing ← `escape60` ← تنظیمات ← متغیرها، تیک «رمزنگاری‌شده»). مقدار متغیرها JSON است، پس رشته را **داخل گیومه‌ی انگلیسی** بنویسید، مثل `"apikey abc123"`:
   - `S3_ACCESS_KEY` و `S3_SECRET_KEY` — کلید Object Storage (از قبل باید باشند).
   - `AI_API_KEY` — **دوباره لازم است**: کلید AIaaS (کاربر ماشینی `escape60-ai`)، با پیشوند `apikey ` یا بدون آن. اگر در نسخه‌ی ۳ پاکش کرده‌اید، از پنل AIaaS یک کلید جدید بسازید.
   - اختیاری: `AI_BASE` (پیش‌فرض `https://api.arvancloudai.ir/v1` — اگر آدرس درگاه شما در پنل AIaaS فرق دارد همان را بگذارید)، `AI_MODEL` (پیش‌فرض `DeepSeek-V4-Flash`)، `AI_DAILY_CAP` (پیش‌فرض ۴۰۰۰ فراخوانی در روز برای تماس مرکز و سرمکانیک).
۳. در پوشه‌ی پروژه بزنید: `npm run deploy` و کلیدهای Object Storage را وقتی پرسید وارد کنید (نمایش داده و ذخیره نمی‌شوند). اسکریپت تست می‌کند، می‌سازد و فایل‌های تغییرکرده را آپلود می‌کند.
۴. وقتی اسکریپت منتظر ماند: پنل ← Edge Computing ← `escape60` ← **ویرایش کد** ← همه‌ی کد را پاک کنید و محتوای کلیپ‌بورد را (همان `dist/edge/worker.js`) بچسبانید ← **انتشار** ← در ترمینال Enter بزنید.
۵. اسکریپت خودش بررسی می‌کند: نسخه‌ی API ‏`4.1.2` و شبیه‌ساز `2.2.0`، ذخیره‌سازی `arvan-object-storage`، فشرده‌سازی Brotli، صفحه‌ی `/edge`، اتصال AIaaS و منبع گزارش امروز (`ai`). اگر چیزی قرمز شد خروجی را بفرستید.
۶. (اختیاری) تست کامل با مرورگر: `GAME_URL=https://escape60.lavanai2525-3qem7.arvanedge.ir npm run test:browser` (با `CHROME_BIN` مثل مرحله‌ی ۰).
۷. **چک‌لیست بعد از دیپلوی — در گوشی آدرس بازی را باز کنید و ببینید:**
   - صفحه‌ی اول: کارت **TODAY** (گزارش امروز شهر) و وضعیت «جدول جهانی آنلاین است».
   - شروع دور: نمای هوایی از بالای شهر که تا پشت ماشین شیرجه می‌زند، کارت اسم محله (مثلاً «شهر قدیم») و نشانگر طلایی «تو»؛ هر دور از یک جای دیگر شهر شروع می‌شود؛ تماس مرکز پلیس در بی‌سیم.
   - حین تعقیب: فلش‌های قرمز/آبی دور ماشین با فاصله برای پلیس‌های بیرون از کادر، نور آژیر از لبه‌ی صفحه، علامت بالای پلیس‌های دیده‌شده، «پلیس پشت سرته!» و دوربینی که عقب می‌رود تا پلیس پشت سرت دیده شود؛ یک بار نمای سینمایی آهسته وقتی پلیس قفل می‌کند.
   - تراشه‌ی **LIVE** با رتبه‌ی زنده زیر نقشه، رقیب شبح (بعد از اولین رکورد تأییدشده)، پیام‌های بی‌سیم و قراردادها.
   - محله‌ها واقعاً فرق دارند: نئون، آجری، سنگفرش و ریسه‌ی لامپ، هتل‌های پاستلی، انبارها، ویلاها، شهرک فناوری با دروازه‌ی اسم.
   - پایان: «رتبه‌ی جهانی #…»، گزارش سرمکانیک و لینک اشتراک `/r/…`.
   - نکته: جدول رکوردها برای هر نسخه‌ی شبیه‌ساز جداست، پس جدول SIM 2.2.0 خالی شروع می‌شود؛ بازیکنی که صفحه‌ی قدیمی را باز نگه داشته پیام «بازی به‌روز شده — دوباره بارگذاری کنید» می‌گیرد.

### برگشت به نسخه‌ی قبل (اگر چیزی خراب شد)
۱. پنل Edge ← `escape60` ← ویرایش کد ← محتوای `edge-backup.js` را بچسبانید ← انتشار.
۲. `index-backup.html` را با نام `index.html` در باکت `escape60-game` آپلود کنید (دسترسی عمومی روشن). فایل‌های جدید با نام هش‌دار به نسخه‌ی قبلی آسیبی نمی‌زنند و می‌توانند بمانند.
۳. چند دقیقه بعد آدرس بازی را تازه کنید (کش HTML روی Edge حدود ۳۰ ثانیه است).

## Architecture on Arvan
There is no separate server. One Arvan Edge Compute (`escape60`) serves the whole game:

| Path | Handled by |
|---|---|
| `/api/v1/*` | `edge/app.mjs` inside the edge worker: tickets, live referee, final replay, leaderboard, ghost rival, PNG cards, daily briefing, radio, dispatcher, crew chief, telemetry, benchmark |
| `/r/<id>` | link preview of a verified run (index.html from the bucket + Open Graph tags + route/target) |
| `/edge` | `edge.html` — live dashboard for judges (not linked from the game UI) |
| everything else | `edge/static.mjs`: the file's basename from the public bucket `escape60-game`, its Brotli/gzip copy when the browser accepts it, MIME / cache headers, byte ranges |

## Arvan resources
- Edge Compute `escape60` (default route `escape60.lavanai2525-3qem7.arvanedge.ir/*`).
- Object Storage bucket `escape60-game` (ir-central1, **public read**) — the flat static build incl. `.br` / `.gz` copies and `edge.html`.
- Object Storage bucket `escape60-data` (ir-central1, **private**) — `runs/`, `runs-by-id/`, `leaderboard/`, `hist/`, `stats/`, `metrics/`, `director/` (frozen daily briefing), `radio/` (daily radio bank). Old `missions/` objects from v2.3 are unused.
- AIaaS: machine user `escape60-ai`, gateway `gateway-yjjo6` (`https://api.arvancloudai.ir/v1`), model `DeepSeek-V4-Flash`.

## Edge variables (Edge → escape60 → تنظیمات → متغیر جدید, tick "encrypted")
Values are JSON, so a string must be written **with double quotes**, e.g. `"abc123"`.

| Name | Required | Value |
|---|---|---|
| `S3_ACCESS_KEY` | yes | Object Storage access key (Object Storage → مدیریت دسترسی) |
| `S3_SECRET_KEY` | yes | Object Storage secret key (also derives the run-ticket HMAC key) |
| `AI_API_KEY` | for AI content | AIaaS key, `"apikey …"` or bare; without it the game uses handwritten briefings/radio/crew chief |
| `AI_BASE` | no | default `https://api.arvancloudai.ir/v1` (the client calls `${AI_BASE}/chat/completions`) |
| `AI_MODEL` | no | default `DeepSeek-V4-Flash` |
| `AI_DAILY_CAP` | no | default `4000` per-run model calls per UTC day (dispatcher + crew chief); the daily briefing and radio are 3 calls a day regardless |
| `REPLAY_CHUNK` | no | default `90` ticks = live-check interval and replay chunk; SIM 2.2 costs ~30–100 µs per tick, so ~10–30 ms per request |
| `PRECOMPRESSED` | no | `false` serves only uncompressed files (use if the deploy check reports a compression mismatch) |
| `RUN_SECRET`, `S3_BUCKET` (`escape60-data`), `S3_ENDPOINT` (`https://s3.ir-central1.arvanstorage.ir`), `S3_REGION` (`ir-central1`), `STATIC_ORIGIN` | no | overrides |

Without the S3 keys the edge falls back to per-isolate memory (leaderboard not durable) and a fixed dev ticket secret; `/api/v1/health` reports `storage: "memory"` and `secured: false`. Without `AI_API_KEY`, `/api/v1/health` reports `ai.configured: false` and every AI job uses its handwritten fallback.

## Release from your own computer — `npm run deploy` (no CI needed)
Needs Node 20+, a clone of the repo and `npm install`. Run it from a network that reaches Arvan.

```bash
npm run deploy                  # tests + build, upload, guided edge step, live checks
npm run deploy -- --dry-run     # list what would change, upload nothing
```

What it does (`scripts/deploy-arvan.mjs`, signing in `scripts/sigv4.mjs`, checked against AWS's published SigV4 examples in `tests/sigv4.test.mjs`):
1. Runs the tests and `npm run build`.
2. Asks for the Object Storage access / secret key (hidden input; or `S3_ACCESS_KEY` / `S3_SECRET_KEY` env vars). Keys are used only for this run and never written to disk.
3. Compares every flat file in `dist/web/` with the bucket by MD5/ETag and uploads only what changed (public-read), **except `index.html`**.
4. Copies `dist/edge/worker.js` to the clipboard and waits while you paste it into Edge → escape60 → ویرایش کد → انتشار; it then checks `/api/v1/health` for the new API and simulation version.
5. Uploads `index.html` last, so players switch to the new client only once the matching edge is live.
6. Verifies: the bucket serves files publicly; the live URL serves the new `app-*.js`; API/SIM versions and storage mode; the game bundle arrives Brotli/gzip-encoded and decodes byte-for-byte; `/edge` is up; AIaaS is configured and today's briefing source (`ai` or `fallback`).

Flags: `--skip-build`, `--skip-tests`, `--force` (upload everything), `--no-wait`. Env overrides: `S3_ENDPOINT`, `S3_REGION`, `STATIC_BUCKET`, `STATIC_ORIGIN`, `GAME_URL`. The edge code itself is replaced in the panel because no Edge Compute code API is documented/verified here.

Rehearsed (2026-11-19) against a local fake S3 + edge that re-verifies every signature. Not yet run against the real Arvan endpoints (the cloud build session could not reach Arvan hosts).

Release 3.5.1 was checked in the cloud session before handing over: `npm run check` (31 tests), `npm run build`, and the browser smoke test (a real autopiloted run verified live and finally, share card, rival) against both `npm start` and the built worker via `npm run edge:local`. The live Arvan steps above were not run from there.

## After deploying: what to check
| Check | Expected |
|---|---|
| `GET /api/v1/health` | `api: "4.1.2"`, `version: "2.2.0"`, `storage: "arvan-object-storage"`, `secured: true`, `ai: {configured: true, model: "DeepSeek-V4-Flash"}` |
| `GET /api/v1/challenges/today` | `brief.source: "ai"` (the first request of a UTC day writes it, ≈5–15 s; later requests read the frozen copy) and `rules` with three contracts |
| `GET /api/v1/radio?lang=en|fa` | HTTP 200; the selected language reports `ai` or `fallback` |
| `/edge` | today's briefing, model calls/tokens/latency, live counters; Live Lab refuses the cheats |
| Game | home card **TODAY**, dispatcher line in the intro, radio during the chase, LIVE chip, crew chief on results |

If `brief.source` is `fallback` with AI configured: the first model call of the day failed or timed out (see `aiFails` on `/edge`); that day stays on the handwritten briefing (rules are frozen once per day so every run of a day is judged the same way). The next day tries again.

## Test the exact deploy artefact locally
`npm run build && npm run edge:local` runs `dist/edge/worker.js` through the same Service Worker `fetch` interface (with `dist/web` as the bucket) on http://localhost:4174. `GAME_URL=http://localhost:4174 npm run test:browser` then plays a real run against it. To see model-written content locally, point the emulator at any OpenAI-compatible endpoint: `AI_API_KEY="apikey …" AI_BASE=<url>/v1 npm run edge:local` (verified 2026-11-19 with a local stand-in gateway).

## Manual release steps (fallback)
1. `npm run check && npm run build` → `dist/web/` and `dist/edge/worker.js`.
2. Upload changed flat files from `dist/web/` to `escape60-game` (public toggle on) — including `edge.html` and every `.br` / `.gz` copy. `index.html` last.
3. Edge → escape60 → ویرایش کد → replace with `dist/edge/worker.js` → انتشار.
4. Verify with the table above.
5. Any simulation change: bump `SIM_VERSION`; the edge replays with the bundled copy of the same `simulation.js`.

## Verified on the live edge (2026-11-19, v2.3 — re-verify after deploying v3.5)
- With keys set: `/api/v1/health` reported `storage: arvan-object-storage`, `secured: true`, AI DeepSeek-V4-Flash; daily AI event generated and frozen; AI coach replies; leaderboard and stats persist.
- Static: HTML, JS, CSS, fonts, audio served with correct MIME; Range requests return 206 (Safari audio).
- Full 60 s run (3600 ticks) accepted after 5 chunked requests; total replay CPU 54.6 ms.

## Runtime findings (Arvan Edge)
- Service Worker `fetch` event interface; `env` global holds variables (`EC_ID`, `EC_URL` always present). `crypto.subtle`, `fetch`, `performance.now` available; `caches` and `localStorage` throw.
- Per-request CPU budget is small: a ~900-tick replay works, a 3600-tick replay is killed ("Request handler dropped response sender"). Hence chunked replay and live checks with HMAC-signed checkpoints.
- `Math.sin`, `Math.cos`, `Math.pow` differ in the last bits from V8/Node → the simulation uses `web/src/dmath.js`.
- Wall time of at least 20 s per request is allowed, but heavy work (replay + many storage writes) in one request gets dropped, so the final storage commit runs in its own request after the last replay chunk.
- Arvan Object Storage honours `If-None-Match: *` but answers 412 to `If-Match` even with the current ETag → `s3.mjs` re-reads the ETag right before an unconditional write.
- DeepSeek-V4-Flash thinks by default (hidden reasoning tokens, slow, can exceed the edge limit) → requests send `thinking: {type: "disabled"}`; then a ~1,100-token answer took ~9 s and a short one ~3 s. The briefing (~700 tokens) and the two radio banks run in separate requests for that reason.
- The AIaaS key is pasted with the `apikey ` prefix; the edge accepts it with or without.

## Danger boundaries
- The S3 key is account-wide (it can also reach other buckets of this account). Do not rotate it in the panel without updating the other projects that use it.
- Never commit keys; they live only in encrypted edge variables.
- Keep the game link live until results (14 Azar 1405).

## Live release check (2026-11-20)
- API 4.1.2, SIM 2.2.0, durable storage and AIaaS configured; new client, Brotli and `/edge` verified by `npm run deploy`.
- A real browser run was verified and ranked, with 31 live checks, a share card and ghost rival. One live request returned a transient 500 (`Request handler dropped response sender`); the game recovered. The browser smoke script reports that console error and exits nonzero.
- The daily briefing came from AIaaS. Radio returned HTTP 200 with the handwritten fallback after its model call failed.
