/* The 14 player cars (plus police and traffic body types). Original designs: each one is *inspired*
 * by a well-known road car shape, with fictional names and no brands, logos or badges.
 * `stats` are simulation inputs (shared with the authoritative replay); `body` is visual only. */

/** Simulation stats: top m/s, accel m/s², grip (lateral settle rate), steer (rad/s at low speed),
 * drift (handbrake slide factor), nitro (+m/s), tank (seconds of boost), armor (damage taken ×), mass. */
const S = (top, accel, grip, steer, drift, nitro, tank, armor, mass) => ({ top, accel, grip, steer, drift, nitro, tank, armor, mass });

export const CARS = [
  { id: 'kaze', name: 'Kaze S15', tag: 'JDM drift coupe', cls: 'B', level: 1, paint: 0xff873c, stripe: 0xfff1de, livery: 'stripes',
    stats: S(60, 11.5, 7.2, 2.15, 1.2, 13, 4.2, 1.0, 1.0),
    body: { L: 4.45, W: 1.72, H: 1.29, wb: 2.52, fo: 0.92, wr: 0.33, nose: 0.62, hood: 0.84, cowl: 0.34, r0: 0.46, r1: 0.68, deck: 0.86, deckY: 0.92, tail: 0.86, belt: 0.86, roofW: 0.74, noseW: 0.86, tailW: 0.92, lights: 'slim', tails: 'slim', spoiler: 'duck', exhaust: 1 } },
  { id: 'volta', name: 'Volta GTI', tag: 'Hot hatch', cls: 'C', level: 1, paint: 0xd8202a, stripe: 0x111111,
    stats: S(55, 12.5, 7.8, 2.35, 1.0, 11, 4.6, 0.95, 0.9),
    body: { L: 3.82, W: 1.64, H: 1.38, wb: 2.4, fo: 0.66, wr: 0.31, nose: 0.7, hood: 0.86, cowl: 0.3, r0: 0.43, r1: 0.86, deck: 0.97, deckY: 0.98, tail: 0.98, belt: 0.88, roofW: 0.82, noseW: 0.94, tailW: 0.96, lights: 'round', tails: 'rect', spoiler: 'lip', exhaust: 1, boxy: 1 } },
  { id: 'hachi', name: 'Hachi 86', tag: 'Light drift legend', cls: 'C', level: 2, paint: 0xf6f6f2, stripe: 0x1a1a1a,
    stats: S(54, 11, 6.6, 2.3, 1.45, 12, 4.4, 1.05, 0.85),
    body: { L: 4.18, W: 1.63, H: 1.33, wb: 2.4, fo: 0.82, wr: 0.3, nose: 0.6, hood: 0.8, cowl: 0.33, r0: 0.45, r1: 0.74, deck: 0.94, deckY: 0.95, tail: 0.95, belt: 0.85, roofW: 0.8, noseW: 0.88, tailW: 0.94, lights: 'popup', tails: 'bar', spoiler: 'lip', exhaust: 1, boxy: 1, twoTone: 1 } },
  { id: 'bavaria', name: 'Bavaria E3', tag: 'Touring car icon', cls: 'B', level: 3, paint: 0x1d4fd8, stripe: 0xffffff,
    stats: S(58, 11.8, 7.6, 2.2, 1.1, 12, 4.4, 0.95, 1.0),
    body: { L: 4.36, W: 1.68, H: 1.37, wb: 2.56, fo: 0.8, wr: 0.32, nose: 0.7, hood: 0.86, cowl: 0.33, r0: 0.44, r1: 0.7, deck: 0.82, deckY: 0.98, tail: 0.98, belt: 0.88, roofW: 0.82, noseW: 0.95, tailW: 0.97, lights: 'quad', tails: 'rect', spoiler: 'lip', exhaust: 2, boxy: 1, flare: 0.05 } },
  { id: 'sterne', name: 'Sterne 190', tag: 'Evo sedan with a wing', cls: 'B', level: 4, paint: 0x1b1d22, stripe: 0xc9cdd4,
    stats: S(59, 11, 7.4, 2.05, 1.05, 12, 4.6, 0.8, 1.15),
    body: { L: 4.5, W: 1.72, H: 1.36, wb: 2.66, fo: 0.82, wr: 0.33, nose: 0.68, hood: 0.86, cowl: 0.33, r0: 0.44, r1: 0.68, deck: 0.8, deckY: 0.98, tail: 0.96, belt: 0.88, roofW: 0.82, noseW: 0.95, tailW: 0.97, lights: 'rect', tails: 'bar', spoiler: 'gt', exhaust: 1, boxy: 1, flare: 0.07 } },
  { id: 'rotor', name: 'Rotor FD', tag: 'Rotary lightweight', cls: 'A', level: 5, paint: 0xf2c200, stripe: 0x111111,
    stats: S(63, 12.4, 8.0, 2.25, 1.25, 14, 4.2, 1.05, 0.9),
    body: { L: 4.3, W: 1.76, H: 1.23, wb: 2.43, fo: 0.95, wr: 0.33, nose: 0.55, hood: 0.78, cowl: 0.37, r0: 0.5, r1: 0.66, deck: 0.9, deckY: 0.88, tail: 0.86, belt: 0.82, roofW: 0.7, noseW: 0.78, tailW: 0.9, lights: 'popup', tails: 'round', spoiler: 'wing', exhaust: 2, curvy: 1 } },
  { id: 'stallion', name: 'Stallion 5.0', tag: 'V8 muscle fastback', cls: 'A', level: 6, paint: 0x0e7a4a, stripe: 0xf4f4f4,
    stats: S(64, 13.5, 6.8, 1.9, 1.15, 14, 4.4, 0.85, 1.3),
    body: { L: 4.78, W: 1.9, H: 1.38, wb: 2.72, fo: 0.95, wr: 0.35, nose: 0.74, hood: 0.92, cowl: 0.38, r0: 0.5, r1: 0.66, deck: 0.88, deckY: 0.98, tail: 0.98, belt: 0.92, roofW: 0.72, noseW: 0.9, tailW: 0.95, lights: 'round', tails: 'bar', spoiler: 'duck', exhaust: 2, scoop: 1, stripes: 1 } },
  { id: 'raiden', name: 'Raiden R4', tag: 'AWD grip monster', cls: 'A', level: 7, paint: 0x5b3fd6, stripe: 0xc0c4cc,
    stats: S(65, 13, 8.6, 2.1, 0.9, 14, 4.6, 0.9, 1.15),
    body: { L: 4.6, W: 1.79, H: 1.36, wb: 2.67, fo: 0.9, wr: 0.34, nose: 0.66, hood: 0.86, cowl: 0.34, r0: 0.45, r1: 0.68, deck: 0.84, deckY: 0.98, tail: 0.97, belt: 0.88, roofW: 0.78, noseW: 0.9, tailW: 0.97, lights: 'slim', tails: 'round', spoiler: 'wing', exhaust: 1, flare: 0.04 } },
  { id: 'tora', name: 'Tora MK4', tag: 'Twin-turbo GT', cls: 'A', level: 8, paint: 0xff6a00, stripe: 0x111111,
    stats: S(68, 12.8, 7.6, 2.0, 1.1, 14, 4.4, 0.95, 1.1),
    body: { L: 4.52, W: 1.81, H: 1.27, wb: 2.55, fo: 0.95, wr: 0.34, nose: 0.6, hood: 0.8, cowl: 0.36, r0: 0.5, r1: 0.68, deck: 0.9, deckY: 0.92, tail: 0.9, belt: 0.84, roofW: 0.7, noseW: 0.8, tailW: 0.92, lights: 'slim', tails: 'round', spoiler: 'hoop', exhaust: 2, curvy: 1 } },
  { id: 'brute', name: 'Brute RT', tag: 'Supercharged bruiser', cls: 'A', level: 9, paint: 0x9b1020, stripe: 0x111111,
    stats: S(66, 14, 6.4, 1.8, 1.2, 14, 4.6, 0.7, 1.45),
    body: { L: 5.0, W: 1.94, H: 1.42, wb: 2.95, fo: 0.96, wr: 0.36, nose: 0.8, hood: 0.96, cowl: 0.38, r0: 0.49, r1: 0.7, deck: 0.82, deckY: 1.0, tail: 1.0, belt: 0.96, roofW: 0.76, noseW: 0.97, tailW: 0.98, lights: 'quad', tails: 'bar', spoiler: 'lip', exhaust: 2, scoop: 1, boxy: 1, stripes: 1 } },
  { id: 'nove', name: 'Nove 11', tag: 'Rear-engine classic', cls: 'S', level: 11, paint: 0xd3d6db, stripe: 0x1a1a1a,
    stats: S(68, 13.5, 8.4, 2.25, 1.05, 14, 4.2, 0.95, 1.0),
    body: { L: 4.3, W: 1.8, H: 1.28, wb: 2.35, fo: 0.95, wr: 0.33, nose: 0.6, hood: 0.72, cowl: 0.33, r0: 0.46, r1: 0.62, deck: 0.94, deckY: 0.84, tail: 0.86, belt: 0.82, roofW: 0.72, noseW: 0.8, tailW: 0.94, lights: 'round', tails: 'bar', spoiler: 'duck', exhaust: 2, curvy: 1, flare: 0.06 } },
  { id: 'apex', name: 'Apex GT', tag: 'Long-hood super GT', cls: 'S', level: 13, paint: 0x3a3d45, stripe: 0x2ee6c8,
    stats: S(71, 14, 8.0, 2.05, 1.1, 15, 4.4, 0.9, 1.15),
    body: { L: 4.55, W: 1.94, H: 1.26, wb: 2.63, fo: 0.92, wr: 0.36, nose: 0.6, hood: 0.8, cowl: 0.45, r0: 0.57, r1: 0.7, deck: 0.92, deckY: 0.9, tail: 0.88, belt: 0.84, roofW: 0.66, noseW: 0.78, tailW: 0.9, lights: 'slim', tails: 'slim', spoiler: 'duck', exhaust: 2, curvy: 1 } },
  { id: 'rosso', name: 'Rosso 40', tag: 'Turbo wedge legend', cls: 'S', level: 15, paint: 0xd4121c, stripe: 0x111111,
    stats: S(73, 15, 8.2, 2.1, 1.1, 16, 4.2, 1.0, 1.05),
    body: { L: 4.36, W: 1.97, H: 1.12, wb: 2.45, fo: 0.98, wr: 0.34, nose: 0.5, hood: 0.66, cowl: 0.35, r0: 0.46, r1: 0.6, deck: 0.9, deckY: 0.92, tail: 0.94, belt: 0.74, roofW: 0.64, noseW: 0.72, tailW: 0.96, lights: 'popup', tails: 'round', spoiler: 'gt', exhaust: 3, flare: 0.05 } },
  { id: 'toro', name: 'Toro V12', tag: 'Scissor-door wedge', cls: 'S', level: 17, paint: 0x6fd12a, stripe: 0x111111,
    stats: S(76, 14.5, 8.0, 2.0, 1.05, 16, 4.4, 0.95, 1.2),
    body: { L: 4.78, W: 2.03, H: 1.1, wb: 2.7, fo: 1.0, wr: 0.36, nose: 0.46, hood: 0.62, cowl: 0.3, r0: 0.45, r1: 0.58, deck: 0.94, deckY: 0.96, tail: 0.94, belt: 0.72, roofW: 0.62, noseW: 0.7, tailW: 0.96, lights: 'slim', tails: 'slim', spoiler: 'wing', exhaust: 2, wedge: 1, flare: 0.04 } },
];
export const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];

/** Display ratings 1..10 for the garage, derived from the simulation stats. */
export function ratings(c) {
  const s = c.stats, r = (v, a, b) => Math.max(1, Math.min(10, Math.round(1 + (9 * (v - a)) / (b - a))));
  return { speed: r(s.top, 52, 76), accel: r(s.accel, 10.5, 15), handling: r(s.grip + s.steer * 2, 10.3, 13.4), drift: r(s.drift, 0.85, 1.45), nitro: r(s.nitro * s.tank, 48, 78), armor: r(1 / s.armor, 0.9, 1.45) };
}

/** Police: cruiser (sedan), interceptor (sports, from heat 3), SUV (heavy, from heat 4). */
export const POLICE = {
  cruiser: { stats: { top: 58, accel: 12, grip: 9, steer: 2.0, mass: 1.25, hp: 100 },
    body: { L: 5.0, W: 1.92, H: 1.45, wb: 2.9, fo: 0.95, wr: 0.34, nose: 0.74, hood: 0.92, cowl: 0.36, r0: 0.47, r1: 0.7, deck: 0.82, deckY: 1.0, tail: 0.98, belt: 0.94, roofW: 0.8, noseW: 0.94, tailW: 0.97, lights: 'rect', tails: 'rect', spoiler: 'none', exhaust: 1, boxy: 1, police: 1, bull: 1 } },
  interceptor: { stats: { top: 68, accel: 14, grip: 9.5, steer: 2.1, mass: 1.15, hp: 90 },
    body: { L: 4.7, W: 1.95, H: 1.3, wb: 2.75, fo: 0.95, wr: 0.35, nose: 0.62, hood: 0.84, cowl: 0.37, r0: 0.5, r1: 0.68, deck: 0.88, deckY: 0.96, tail: 0.94, belt: 0.88, roofW: 0.72, noseW: 0.86, tailW: 0.94, lights: 'slim', tails: 'bar', spoiler: 'lip', exhaust: 2, curvy: 1, police: 1 } },
  suv: { stats: { top: 60, accel: 11.5, grip: 8.4, steer: 1.85, mass: 1.7, hp: 140 },
    body: { L: 5.05, W: 2.0, H: 1.82, wb: 2.95, fo: 0.92, wr: 0.4, nose: 0.92, hood: 1.08, cowl: 0.33, r0: 0.42, r1: 0.92, deck: 0.98, deckY: 1.32, tail: 1.3, belt: 1.12, roofW: 0.86, noseW: 0.96, tailW: 0.98, lights: 'rect', tails: 'rect', spoiler: 'none', exhaust: 1, boxy: 1, police: 1, bull: 1, lift: 0.12 } },
};
export const POLICE_TYPES = ['cruiser', 'interceptor', 'suv'];

/** Civilian traffic body types (visual; all share the same traffic physics). */
export const TRAFFIC = [
  { id: 'sedan', L: 4.7, W: 1.82, H: 1.45, wb: 2.75, fo: 0.92, wr: 0.32, nose: 0.72, hood: 0.88, cowl: 0.34, r0: 0.45, r1: 0.7, deck: 0.82, deckY: 0.98, tail: 0.96, belt: 0.9, roofW: 0.8, noseW: 0.92, tailW: 0.95, lights: 'slim', tails: 'rect', spoiler: 'none', exhaust: 1 },
  { id: 'hatch', L: 4.0, W: 1.75, H: 1.5, wb: 2.5, fo: 0.78, wr: 0.31, nose: 0.74, hood: 0.9, cowl: 0.3, r0: 0.42, r1: 0.86, deck: 0.97, deckY: 1.0, tail: 1.0, belt: 0.92, roofW: 0.84, noseW: 0.92, tailW: 0.96, lights: 'slim', tails: 'rect', spoiler: 'lip', exhaust: 1 },
  { id: 'suv', L: 4.8, W: 1.95, H: 1.75, wb: 2.85, fo: 0.9, wr: 0.38, nose: 0.9, hood: 1.04, cowl: 0.32, r0: 0.42, r1: 0.9, deck: 0.98, deckY: 1.26, tail: 1.24, belt: 1.08, roofW: 0.86, noseW: 0.95, tailW: 0.98, lights: 'rect', tails: 'rect', spoiler: 'none', exhaust: 1, boxy: 1, lift: 0.1 },
  { id: 'van', L: 5.2, W: 2.0, H: 2.15, wb: 3.2, fo: 0.7, wr: 0.36, nose: 0.95, hood: 1.15, cowl: 0.16, r0: 0.26, r1: 0.98, deck: 1.0, deckY: 1.9, tail: 1.9, belt: 1.15, roofW: 0.94, noseW: 0.96, tailW: 0.99, lights: 'rect', tails: 'rect', spoiler: 'none', exhaust: 1, boxy: 1, van: 1 },
  { id: 'taxi', L: 4.7, W: 1.82, H: 1.45, wb: 2.75, fo: 0.92, wr: 0.32, nose: 0.72, hood: 0.88, cowl: 0.34, r0: 0.45, r1: 0.7, deck: 0.82, deckY: 0.98, tail: 0.96, belt: 0.9, roofW: 0.8, noseW: 0.92, tailW: 0.95, lights: 'rect', tails: 'rect', spoiler: 'none', exhaust: 1, boxy: 1, taxi: 1 },
  { id: 'pickup', L: 5.3, W: 1.98, H: 1.75, wb: 3.3, fo: 0.92, wr: 0.38, nose: 0.92, hood: 1.08, cowl: 0.3, r0: 0.4, r1: 0.6, deck: 0.64, deckY: 1.12, tail: 1.12, belt: 1.1, roofW: 0.86, noseW: 0.95, tailW: 0.99, lights: 'rect', tails: 'rect', spoiler: 'none', exhaust: 1, boxy: 1, bed: 1, lift: 0.1 },
];
/** Civilian paint colours (realistic, slightly muted so the hero and police stand out). */
export const TRAFFIC_COLORS = [0xe9ecef, 0x1c1f24, 0x8a9099, 0xb3121b, 0x1f3f7a, 0x2c6e49, 0xd6c7a1, 0x5a3825, 0x6d7d8c, 0xf0f0ea, 0x283a52, 0x9e2a2b];

/** Paints players can pick for any unlocked car (cosmetic). */
export const PAINTS = [
  { id: 'stock', color: null, level: 1 },
  { id: 'sunset', color: 0xff873c, level: 1 }, { id: 'flamingo', color: 0xff5d95, level: 1 }, { id: 'lagoon', color: 0x19b8bc, level: 1 },
  { id: 'violet', color: 0x7a3df0, level: 2 }, { id: 'gold', color: 0xffc93c, level: 2 }, { id: 'night', color: 0x23203a, level: 3 },
  { id: 'ice', color: 0xe9f4ff, level: 3 }, { id: 'lava', color: 0xe0221f, level: 4 }, { id: 'white', color: 0xf3f4f6, level: 4 },
  { id: 'black', color: 0x15161a, level: 5 }, { id: 'lime', color: 0x7ad51f, level: 5 }, { id: 'blue', color: 0x1d4fd8, level: 6 },
  { id: 'mint', color: 0x8fe3c4, level: 7 }, { id: 'silver', color: 0xb9bec7, level: 8 }, { id: 'chrome', color: 0xd9dde3, level: 10, chrome: 1 },
];
export const LIVERIES = [
  { id: 'clean', level: 1 }, { id: 'stripes', level: 2 }, { id: 'side', level: 3 }, { id: 'twotone', level: 4 }, { id: 'race', level: 6 },
];
