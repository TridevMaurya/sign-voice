import type { Glyph, HandPose } from "./signs";

/**
 * Har sign ki saaf line-drawing SVG banata hai. Haath ko capsules (ungliyan) aur ek rounded
 * palm se banate hain: pehle mota outline, uske upar patla fill, jisse ek hi silhouette dikhe.
 */

const W = 10; // ungli ki motai
const O = 2.4; // outline ki motai

type Seg = [number, number, number, number];

const BASES: [number, number][] = [
  [38, 50],
  [47.5, 49],
  [56.5, 50],
  [64.5, 52],
];
const TIPS: [number, number][] = [
  [35, 17],
  [47.5, 11],
  [59, 15],
  [70, 27],
];
const BUNCH_TIPS: [number, number][] = [
  [45, 21],
  [48.5, 17],
  [52, 19],
  [55, 23],
];

function handParts(pose: HandPose) {
  const segs: Seg[] = [];
  const top: Seg[] = []; // palm ke upar dikhne wale (mudha hua angutha)
  const creases: Seg[] = []; // patli lines jo ungliyan alag dikhati hain
  let ring = false;

  pose.fingers.forEach((ext, i) => {
    const [bx, by] = BASES[i];
    if (pose.bunch) {
      const [tx, ty] = BUNCH_TIPS[i];
      segs.push([bx, by, tx, ty]);
    } else if (pose.touch && i === 0) {
      segs.push([bx, by, 30, 45]);
    } else if (ext) {
      const [tx, ty] = TIPS[i];
      segs.push([bx, by, tx, ty]);
    } else {
      segs.push([bx, by, bx, by - 7]);
    }
  });

  if (pose.bunch) {
    segs.push([36, 72, 44, 25]);
    for (let i = 0; i < 3; i++) {
      const x = (BASES[i][0] + BASES[i + 1][0]) / 2;
      const tx = (BUNCH_TIPS[i][0] + BUNCH_TIPS[i + 1][0]) / 2;
      creases.push([x, 47, tx, 27]);
    }
  } else if (pose.touch) {
    segs.push([35, 72, 14, 48]);
    ring = true;
  } else if (pose.thumb === "out") segs.push([36, 72, 17, 49]);
  else if (pose.thumb === "up") segs.push([33, 64, 28, 26]);
  else if (pose.thumb === "side") segs.push([34, 72, 31, 48]);
  else top.push([37, 73, 57, 63]);

  // kalai
  segs.push([51, 78, 51, 110]);
  return { segs, top, creases, ring };
}

const RING = { cx: 21, cy: 36, r: 10, w: 7 };

const line = ([x1, y1, x2, y2]: Seg, width: number, color: string) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${width}" style="stroke:${color}" stroke-linecap="round"/>`;

const INK = "currentColor";
const FILL = "var(--glyph-fill, #fff)";

function handSvg(pose: HandPose) {
  const { segs, top, creases, ring } = handParts(pose);
  const ringSvg = (width: number, color: string) =>
    ring
      ? `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" stroke-width="${width}" style="fill:none;stroke:${color}"/>`
      : "";
  const palm = (stroke: boolean) =>
    `<rect x="32" y="46" width="38" height="36" rx="12" style="fill:${FILL};${stroke ? `stroke:${INK};stroke-width:${O * 2}` : ""}"/>`;
  return [
    ...segs.map((s) => line(s, W + O * 2, INK)),
    ringSvg(RING.w + O * 2, INK),
    palm(true),
    ...segs.map((s) => line(s, W, FILL)),
    ringSvg(RING.w, FILL),
    palm(false),
    ...top.map((s) => line(s, W + O * 2, INK)),
    ...top.map((s) => line(s, W, FILL)),
    ...creases.map((s) => line(s, 1.6, INK)),
  ].join("");
}

/** Namaste: dono hatheli judi hui, side se. */
function joinedPalms() {
  const shape = "M50 12 C58 12 62 20 62 34 L62 62 C62 70 57 74 50 74 C43 74 38 70 38 62 L38 34 C38 20 42 12 50 12 Z";
  const arms: Seg[] = [
    [45, 70, 22, 104],
    [55, 70, 78, 104],
  ];
  return [
    ...arms.map((s) => line(s, 13 + O * 2, INK)),
    `<path d="${shape}" style="fill:${FILL};stroke:${INK};stroke-width:${O * 2}"/>`,
    ...arms.map((s) => line(s, 13, FILL)),
    `<path d="${shape}" style="fill:${FILL}"/>`,
    line([50, 18, 50, 70], 1.8, INK),
    line([41, 62, 43, 46], 1.6, INK),
    line([59, 62, 57, 46], 1.6, INK),
  ].join("");
}

export function glyphSvg(glyph: Glyph): string {
  const [a, b] = glyph.hands;
  let body: string;
  if (!b) {
    const r = a.rotate ?? 0;
    body = `<g transform="rotate(${r} 51 56)">${handSvg(a)}</g>`;
  } else if (glyph.layout === "joined") {
    body = joinedPalms();
  } else {
    body =
      `<g transform="translate(-4 22) scale(0.6)">${handSvg(a)}</g>` +
      `<g transform="translate(104 22) scale(-0.6 0.6)">${handSvg(b)}</g>`;
  }
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="overflow:hidden">${body}</svg>`;
}
