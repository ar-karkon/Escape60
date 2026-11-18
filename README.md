# ESCAPE 60 — فرار ۶۰

> **Status:** Pre-production / documentation baseline — 2026-11-19 (28 Aban 1405)
>
> **Repository:** [ar-karkon/Escape60](https://github.com/ar-karkon/Escape60) — public GitHub repository
>
> **Game:** mobile-first, fast browser arcade police chase; original IP, unrelated to Rockstar Games.

## خلاصه

«فرار ۶۰» یک بازی آرکید تعقیب‌وگریز خودرو در مرورگر است. بازیکن باید تا ۶۰ ثانیه از محاصره پلیس فرار کند؛ پس از هر تلاش، زمان بقا، رکورد و امکان دعوت دوستان برای تجربه همان چالش نمایش داده می‌شود. هدف، تجربه‌ای سریع، قابل اشتراک‌گذاری و مناسب موبایل است.

**این پوشه فقط شامل اسناد طراحی است؛ هنوز هیچ نمونه بازی، بک‌اند، استقرار یا امتیاز واقعی وجود ندارد.** اطلاعات پیشنهادی در اسناد با برچسب `PROPOSED` و تصمیم‌های نهایی با `CONFIRMED` مشخص شده‌اند.

## چرا این پروژه؟

ساخته‌شدن برای رویداد [Edge Games آروان‌کلاد](https://try.arvancloud.ir/edge-games/) و انتشار بازی روی پردازش لبه؛ مهلت ثبت لینک مطابق [اطلاعیه رسمی آروان](https://t.me/s/arvancloud) پایان ۹ آذر ۱۴۰۵ است. اهداف رقابتی: جذب بازیکنان واقعی، تجربه قابل دفاع در داوری، و کاربرد مناسب Edge. هیچ جایزه یا نتیجه‌ای تضمین‌شده نیست.

## Design pillars

1. **First play in seconds** — بدون ثبت‌نام اجباری و بدون آموزش طولانی.
2. **60-second dramatic arc** — تعقیب رو به سخت‌تر شدن، چالش منصفانه و پایان به‌یادماندنی.
3. **Replay and challenge** — تکرار سریع، رقابت منصفانه با Seed یکسان، لینک دعوت.
4. **Mobile-first** — حجم کم، کنترل ساده، عملکرد پایدار در گوشی میان‌رده.
5. **Real edge logic** — اعتبارسنجی درخواست‌ها/نتیجه‌ها و مدیریت چالش‌ها در سمت سرویس، نه صرفاً میزبانی فایل‌ها.
6. **Original assets and respectful growth** — محتوای مستقل؛ بدون تقلید از IP بازی‌های دیگر یا بازیکن ساختگی.

## وضعیت تصمیم‌ها

- **CONFIRMED:** نام کاری Escape 60 / فرار ۶۰، بازی تعقیب‌وگریز آرکید خودرو، مرورگر، زمان هدف هر دست ۶۰ ثانیه، تاکید بر چالش دوستان و مناسب‌بودن برای مسابقه.
- **PROPOSED:** دوربین ایزومتریک 2.5D؛ حرکت خودکار خودرو + فرمان لمسی؛ شهر خیالی نئونی؛ Phaser + TypeScript + Vite؛ چالش روزانه؛ پلیس با AI الگوریتمی.
- **OPEN:** رفتار دقیق برخورد، مدل امتیازدهی، نقشه‌ها، فناوری ذخیره‌سازی و واج‌های نهایی Arvan Edge، مجوز متن‌باز، لوگو و هویت بصری.

## نقشه مستندات

| فایل | موضوع |
|---|---|
| [docs/00_STATUS.md](docs/00_STATUS.md) | وضعیت پروژه، سطح اطمینان و کارهای باز |
| [docs/01_PRODUCT_BRIEF.md](docs/01_PRODUCT_BRIEF.md) | خلاصه محصول، مخاطب و مزیت |
| [docs/02_GAME_DESIGN.md](docs/02_GAME_DESIGN.md) | GDD کامل و حلقه بازی |
| [docs/03_GAMEPLAY_BALANCE.md](docs/03_GAMEPLAY_BALANCE.md) | فیزیک، رفتار پلیس و امتیاز |
| [docs/04_UX_UI.md](docs/04_UX_UI.md) | جریان‌ها و الزامات رابط |
| [docs/05_ARCHITECTURE.md](docs/05_ARCHITECTURE.md) | معماری پیشنهادی و ساختار پروژه |
| [docs/06_EDGE_SPEC.md](docs/06_EDGE_SPEC.md) | مدل API، امنیت نتیجه‌ها و امکان‌سنجی |
| [docs/07_COMPETITION.md](docs/07_COMPETITION.md) | الزامات مسابقه و موارد نیازمند تأیید |
| [docs/08_MARKET_RESEARCH.md](docs/08_MARKET_RESEARCH.md) | دلایل انتخاب ایده و منابع آماری |
| [docs/09_GROWTH.md](docs/09_GROWTH.md) | راهبرد جذب بازیکن واقعی |
| [docs/10_ROADMAP.md](docs/10_ROADMAP.md) | برنامه انتشار تا مهلت رقابت |
| [docs/11_QA.md](docs/11_QA.md) | تست و معیار آماده‌بودن |
| [docs/12_PRIVACY_SECURITY.md](docs/12_PRIVACY_SECURITY.md) | حریم خصوصی و ضدتقلب |
| [docs/13_DECISIONS.md](docs/13_DECISIONS.md) | ثبت تصمیم‌ها و فرضیات |
| [docs/14_IP_ASSETS.md](docs/14_IP_ASSETS.md) | حقوق مالکیت، دارایی‌ها، مجوز |
| [docs/15_METRICS.md](docs/15_METRICS.md) | رویدادهای تحلیلی، بدون داده شخصی |
| [docs/16_BACKLOG.md](docs/16_BACKLOG.md) | تسک‌های توسعه اولویت‌بندی‌شده |
| [docs/17_SOURCES.md](docs/17_SOURCES.md) | منابع و لینک‌های بررسی‌شده |
| [docs/18_AGENTS.md](docs/18_AGENTS.md) | دستورالعمل Codex/Claude Code |
| [docs/19_GLOSSARY.md](docs/19_GLOSSARY.md) | اصطلاحات و تعاریف |
| [docs/20_RESEARCH_QUESTIONS.md](docs/20_RESEARCH_QUESTIONS.md) | فهرست ابهام‌های فنی/مسابقه |

## توسعه

هنوز هیچ کد اجرایی وجود ندارد. پس از تأیید تصمیم‌های باز، شاخه‌ی `feat/vertical-slice` برای نمونه نخست پیشنهاد می‌شود. راهنمای همکاری در [CONTRIBUTING.md](CONTRIBUTING.md) آمده است.

## Licensing

**Public ≠ open source.** هنوز هیچ مجوزی برای استفاده، توزیع یا تغییر کد انتخاب نشده است. انتشار عمومی این سند مجوز استفاده مجدد از کد/دارایی‌ها نمی‌دهد. پیش از انتشار سورس واقعی، مالک پروژه باید درباره MIT / Apache-2.0 / proprietary تصمیم بگیرد.