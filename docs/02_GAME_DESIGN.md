# Game Design Document (GDD) — v0.1

## Fantasy and fantasy boundary
بازیکن راننده‌ای در شهر **کاملاً خیالی** است که باید برای ۶۰ ثانیه از محاصره ماشین‌های پلیس فرار کند. حس تعقیب، تصمیم‌گیری لحظه‌ای و جاخالی موفق محور اصلی است. این بازی نسخه GTA نیست.

## Core loop
1. ورود با لینک → `PLAY` فوری / کنترل خیلی کوتاه.
2. شروع چالش و گیم‌پلی، حداکثر ۶۰ ثانیه.
3. نزدیک‌شدن پلیس، خطر محیط، فرصت مانور.
4. باخت بر اثر آسیب کامل/گیر افتادن (قانون دقیق TBD) یا رسیدن به ۶۰ ثانیه.
5. نتیجه: زمان زنده‌ماندن، امتیاز عملکرد، رتبه (اگر معتبر و آنلاین)، دکمه Replay و Share.
6. ورود بازیکن بعدی با همان seed/day challenge، مقایسه معتبر.

## Proposed 60s dramatic pacing (not yet playtested)
| Time | Encounter | Intent |
|---|---|---|
| 0–10s | یک پلیس، سرعت پایین‌تر، آموزش پنهان | کنترل را بفهم |
| 10–25s | دومین پلیس، مانع ساده | ریتم |
| 25–40s | محاصره/roadblock قابل پیش‌بینی | اولین لحظه هیجان |
| 40–55s | افزایش فشار، تصمیم‌های سخت | اوج |
| 55–60s | آخرین محاصره اما قابل حل | پایان قابل تعریف |

## Win / lose
- **Success:** زنده‌ماندن کامل ۶۰ ثانیه.
- **Fail:** برخوردهای نامطلوب یا گیر افتادن با قوانین شفاف و بدون مرگ تصادفی غیرمنصفانه.
- Tie-break: امتیاز ریسک و مهارت؛ قواعد دقیق به بخش gameplay_balance رجوع شود.

## Interactions
- Smartphone: auto-forward plus drag steering (**proposed**); alternative two-button steering to A/B test.
- Desktop: arrow/A-D steering + Space restart; optional pointer input.
- Pause on visibility change where fairness permits; daily competitive sessions might need explicit invalidation rules.

## Game feel targets — experiments, not promises
- Visual anticipation before each hazard >= 0.6s in standard mode; measure with testing.
- Responsive input at browser frame rate; prevent unfair instant hit.
- Small crash feedback: screen shake, sparks, hit-stop < 120 ms, sound optional and user-controlled.
- No mandatory cutscenes or dismissals after retry.

## Level design
One compact city arena with readable road surfaces, turns, intersections and safe evasive maneuvers. Fair seeded obstacle positions if comparing players. Later: daily seeds, weather/visual variants **without altering fairness**.

## Level 0 / 20-second vertical slice
Player car, steering, one pursuing police car, one obstacle, collision consequence, restart button, FPS diagnostics. If not fun, revise before broader development.

## Accessibility / sensitivity
High-contrast UI, motion reduction toggle, audio off by default on mobile pending user interaction, no flashing/strobing, clear controls for color-blind users. Suitable content without realistic violence, gore or real-world crime simulation.
