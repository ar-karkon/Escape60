/* Original pixel-art UI icons. Each icon is a grid of palette letters rendered as crisp SVG. */
const PAL = {
  k: "#1b0b2b", w: "#fff4e6", y: "#ffe37c", o: "#ffad65", d: "#e0892e", p: "#ff5d95", r: "#ff416a",
  c: "#3dd8e7", b: "#3f98ff", v: "#8d54e9", g: "#5dffb0", s: "#b9b4d0", n: "#3a2054", e: "#c8174a",
};
const ICONS = {
  trophy: [
    "..yyyyyyyy..", ".yyyyyyyyyy.", "yy.yyyyyyo.y", "yy.yyyyyyo.y", ".y.yyyyyyo.y", "..yyyyyyoo..",
    "...yyyyoo...", "....yooo....", ".....yo.....", "....yyoo....", "...yyyyoo...", "...dddddd...",
  ],
  calendar: [
    "..k......k..", ".rrrrrrrrrr.", ".rrrrrrrrrr.", ".wwwwwwwwww.", ".wkk.kk.kkw.", ".wkk.kk.kkw.",
    ".wwwwwwwwww.", ".wkk.kk.kkw.", ".wkk.kk.kkw.", ".wwwwwwwwww.", ".ssssssssss.",
  ],
  gear: [
    ".....ss.....", "..s..ss..s..", ".sssssssssss", "..ssswwsss..", "..ssw..wss..", "sssw....wsss",
    "sssw....wsss", "..ssw..wss..", "..ssswwsss..", ".sssssssssss", "..s..ss..s..", ".....ss.....",
  ],
  play: ["k.......", "kk......", "kkk.....", "kkkk....", "kkkkk...", "kkkkkk..", "kkkkk...", "kkkk....", "kkk.....", "kk......", "k......."],
  pause: ["ww..ww", "ww..ww", "ww..ww", "ww..ww", "ww..ww", "ww..ww", "ww..ww"],
  share: ["......ww..", ".....wwww.", "......ww..", "....ww....", "..ww......", "ww........", "..ww......", "....ww....", "......ww..", ".....wwww.", "......ww.."],
  home: ["....ww....", "...wwww...", "..wwwwww..", ".wwwwwwww.", "wwwwwwwwww", ".ww....ww.", ".ww.kk.ww.", ".ww.kk.ww.", ".wwwkkwww."],
  replay: ["...wwww...", ".ww....ww.", "w........w", "w...k....w", "w.........", "w.........", "w.......ww", ".ww...wwww", "...wwwwwww"],
  heart: [".rr..rr.", "rprrrrrr", "rpprrrrr", "rrrrrrrr", ".rrrrrr.", "..rrrr..", "...rr..."],
  heartEmpty: [".nn..nn.", "nkknnkkn", "nkkkkkkn", "nkkkkkkn", ".nkkkkn.", "..nkkn..", "...nn..."],
  star: ["....yy....", "....yy....", "...yyyy...", "yyyyyyyyyy", ".yyyyyyyy.", "..yyyyyy..", "..yyyyyy..", ".yyy..yyy.", ".yy....yy."],
  stopwatch: ["...cccc...", "....cc....", "..cccccc..", ".c..ww..c.", "c...ww...c", "c...www..c", "c........c", ".c......c.", "..cccccc.."],
  police: ["...rrbb...", "..kkkkkk..", ".kwwkkwwk.", "kkkkkkkkkk", "kwwwwwwwwk", "kyyk..kyyk", ".kk....kk."],
  drift: ["..oooooo..", ".oyyyyyyo.", "ookkookkoo", "oooooooooo", ".kk....kk.", "..........", "yy.yy.yy..", ".yy.yy.yy."],
  bars: [".........ww", ".........ww", "......ww.ww", "......ww.ww", "...ww.ww.ww", "...ww.ww.ww", "ww.ww.ww.ww", "ww.ww.ww.ww"],
  check: [".........cc", "........ccc", ".......ccc.", "cc....ccc..", "ccc..ccc...", ".ccccccc...", "..ccccc....", "...ccc....."],
  laurel: [".....y..", "..yy.y..", ".yyo.y..", "..o.y...", ".yy.y...", "yyo.y...", ".o.y....", ".yyy....", "yyo.y...", ".o..y...", "..yy.y..", ".yyo..y.", "..o....y"],
  sound: ["....w.....", "...ww..w..", "wwwww...w.", "wwwww.w..w", "wwwww.w..w", "wwwww...w.", "...ww..w..", "....w....."],
  mute: ["....w.....", "...ww.....", "wwwww.r..r", "wwwww..rr.", "wwwww..rr.", "wwwww.r..r", "...ww.....", "....w....."],
  arrowL: [
    "......wwww..", "....wwwwwwww", "...www....ww", "..ww......ww", ".ww.......ww", "wwwwww...ww.",
    ".wwww....ww.", "..ww....ww..", "........ww..",
  ],
  siren: ["..rr..", ".rrrr.", "rrwwrr", "rrrrrr", "kkkkkk"],
  sirenOff: ["..nn..", ".nnnn.", "nnnnnn", "nnnnnn", "kkkkkk"],
  shield: ["wwwwwwww", "wccccccw", "wccwwccw", "wcwccwcw", "wccccccw", ".wccccw.", "..wccw..", "...ww..."],
  dice: ["wwwwwwww", "wkwwwwww", "wwwwwwww", "wwwkkwww", "wwwkkwww", "wwwwwwww", "wwwwwwkw", "wwwwwwww"],
};

export function iconSVG(name, mirror = false) {
  const g = ICONS[name];
  if (!g) return "";
  const h = g.length, w = Math.max(...g.map((r) => r.length));
  const byColor = {};
  g.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      if (c === ".") { x++; continue; }
      let e = x;
      while (e + 1 < row.length && row[e + 1] === c) e++;
      (byColor[c] ??= []).push(`M${x} ${y}h${e - x + 1}v1h-${e - x + 1}z`);
      x = e + 1;
    }
  });
  const paths = Object.entries(byColor).map(([c, d]) => `<path fill="${PAL[c]}" d="${d.join("")}"/>`).join("");
  return `<svg class="px-icon" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true"${mirror ? ' style="transform:scaleX(-1)"' : ""}>${paths}</svg>`;
}

/** Replace every [data-icon] placeholder with its SVG. */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll("[data-icon]")) {
    el.innerHTML = iconSVG(el.dataset.icon, el.hasAttribute("data-mirror"));
  }
}
