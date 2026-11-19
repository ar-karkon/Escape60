# Decision register / ADR log

Date: 2026-11-19

| ID | Topic | State | Current direction | Why / next evidence |
|---|---|---|---|---|
| D01 | Game concept | CONFIRMED | Arcade police-car escape, 60 seconds | User approved concept |
| D02 | Working name | CONFIRMED | Escape 60 / فرار ۶۰ | Discussed |
| D03 | Distribution | CONFIRMED | Browser/Edge competition | User intent |
| D04 | Camera | IMPLEMENTED | Close rear three-quarter chase camera (~9.4 high, 14 behind, FOV 58→64 with speed) | Hero ≈100px wide at 390px; road ahead + horizon visible; off-screen police arrow |
| D05 | Mobile controls | PROPOSED | Auto forward + finger steering | One-finger ease; test alternatives |
| D06 | Art identity | IMPLEMENTED | Sunset Bay | Tropical neon direction in document 24 |
| D07 | Mechanics | PROPOSED | Pursuit first, optional drift score | Test fun |
| D08 | Engine | IMPLEMENTED | Three.js r170, merged voxel geometry per 52-unit tile + procedural shader patterns, half-float bloom | One draw call per tile; adaptive resolution/shadows; `?q=high` lock for benchmarks |
| D09 | Competitive mode | PROPOSED | Seeded shared/daily challenges | Fair sharing |
| D10 | Score | PROPOSED | Survival time plus skill points tie-break | Needs testing |
| D11 | Backend | OPEN | Edge API + durable adapter | Runtime, quota, persistence TBD |
| D12 | Repo license | OPEN | None yet | Public visibility not a license |
| D13 | Data handling | OPEN | Anonymous/minimal | Full rule/legal review |
| D14 | UI typography | IMPLEMENTED | Vazirmatn (Persian) + Jersey 10 (digits/Latin), both OFL and bundled | Pixelify Sans rejected: its 5 and S were confusable in the timer |

## ADR template
```
# ADR-XXX: short title
Date:
Status: proposed/accepted/superseded
Context:
Options:
Decision:
Tradeoffs:
Revisit triggers:
```
