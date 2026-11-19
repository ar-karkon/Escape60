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
| D15 | Scoring 1.2.0 | IMPLEMENTED | Skill chain ×1…×5 for near misses / roadblock dodges, reset on hit; SIM_VERSION 1.2.0 | Rewards risky skilful driving; replay-verified; rankings keyed per version |
| D16 | Audio | IMPLEMENTED | Licensed CC0/CC-BY OpenGameArt music + SFX, streamed music, decoded SFX | Owner asked for free tracks with a neon-coastal mood instead of synthesis |
| D17 | Sharing | IMPLEMENTED | Story/Post/Wide cards from real frames + QR + challenge link with friend target | Friend targets are unverified link data and labelled as such |
| D21 | City layout | IMPLEMENTED | SIM 1.4.0 seeded street network: avenues, T-junctions, dead ends, closed segments as parks/plazas/malls/car parks; minimap | Owner: the city was all four-way crossroads |
| D22 | Performance | IMPLEMENTED | Device profile (GPU string, memory, cores, touch) picks a start rung; 6-step quality ladder adapts to frame time; traffic drawn in one call | Owner: must run well on weak phones |
| D14 | UI typography | IMPLEMENTED | Rooyin Free pixel font for Persian (OFL, designer Mohamad Darvishi, github.com/MohamadDarvishi/Rooyin) + Jersey 10 for digits/Latin; Vazirmatn kept only as fallback | Owner asked for Rooyin; the free OFL edition is bundled unmodified |
| D18 | Health | IMPLEMENTED | SIM 1.3.0 health bar with impact-scaled damage and slow regen | Small bumps no longer cost a whole life |
| D19 | Living city | IMPLEMENTED | Visual-only pedestrians that walk, wait, cross and leap clear of cars; traffic/police spawn out of view | Owner: city felt empty and cars popped in |
| D20 | Look | IMPLEMENTED | Softer rendering (FXAA, smooth upscale, higher internal resolution, less grain) + comic ink outlines, halftone shadows and graffiti VFX layer | Owner reference: NFS Unbound vibe; all effects original |

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
