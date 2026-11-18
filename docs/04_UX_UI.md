# UX/UI specification — v0.1

## Screens
1. **Landing:** title, prominent Play, mute, tiny controls hint, link to privacy/about.
2. **Playing HUD:** large timer (remaining), damage/hearts, unobtrusive score; no clutter.
3. **Results:** survival (e.g., 47.82s), result text, local best, online rank **only if verified**, Replay CTA, Share Challenge CTA.
4. **Daily/Challenge:** seed/identity and fair rules, leaderboard with anonymous aliases.
5. **Error/offline:** retry and practice mode; never show fabricated leaderboard.

## Language
FA default; use CSS logical properties and RTL for prose, LTR numbers/time and mixed terms; optional EN copy in a dedicated dictionary.

## Style candidates (not approved)
A: fictional night city / deep navy, amber car, police red-blue illumination.
B: modern Iranian street elements with original art and no real-world identifiers.
C: retro pixel aesthetic. Avoid overusing glow and unreadable small text.

## Primary mobile viewport
Portrait-first for sharing flow, but **landscape vs portrait gameplay must be tested early**. Touch control must not hide car or obstacles; do not force orientation until validated.

## Sharing text example
«من ۴۷٫۸۲ ثانیه توی فرار ۶۰ دوام آوردم! می‌تونی رکوردم رو بزنی؟» [challenge URL]
Use navigator.share only on direct user click with robust copy-link fallback; no auto-invites.

## Content rules
Never show fake percentile or online rank. No dark patterns for sharing, no requests for sensitive personal data, no intrusive prompts.
