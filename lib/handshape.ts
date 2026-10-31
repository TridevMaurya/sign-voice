import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Rule-based handshape classifier. Kisi training ki zaroorat nahi:
 * har ungli ka "khuli / band" state 3D landmarks ke angles se nikalta hai,
 * aur fir pattern se sign tay hota hai.
 */

export type Hand = {
  /** Image coordinates (0..1), y neeche ki taraf badhta hai */
  image: NormalizedLandmark[];
  /** 3D world coordinates (meters), angles ke liye zyada reliable */
  world: Landmark[];
};

export type HandState = {
  thumb: boolean;
  /** index, middle, ring, pinky */
  fingers: [boolean, boolean, boolean, boolean];
  /** "thumb index middle ring pinky" as 1/0, jaise "01100" (debug ke liye) */
  pattern: string;
};

const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
] as const;

type P = { x: number; y: number; z: number };

const sub = (a: P, b: P) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: P) => Math.hypot(v.x, v.y, v.z);
const dist = (a: P, b: P) => len(sub(a, b));
const dist2d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);

/** Do vectors ke beech ka angle (degrees). 0 = bilkul seedha. */
function bend(a: P, b: P, c: P) {
  const u = sub(b, a);
  const v = sub(c, b);
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (len(u) * len(v) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

function palmSize(w: P[]) {
  return dist(w[0], w[9]) || 1;
}

export function handState(hand: Hand): HandState {
  const w = hand.world;
  const palm = palmSize(w);

  const fingers = FINGERS.map(([mcp, pip, dip, tip]) => {
    const curl = bend(w[mcp], w[pip], w[dip]) + bend(w[pip], w[dip], w[tip]);
    const reach = dist(w[tip], w[0]) / palm;
    // Seedhi ungli (kam curl). Haath tircha ho to reach kam dikhti hai, isliye do raaste.
    return (curl < 60 && reach > 1.2) || (curl < 80 && reach > 1.55);
  }) as HandState["fingers"];

  // Angutha: tip index ki jad (5) aur palm ke beech (9) se door ho, aur seedha ho.
  const thumbAway = dist(w[4], w[5]) / palm > 0.62 && dist(w[4], w[9]) / palm > 0.85;
  const thumbStraight = bend(w[2], w[3], w[4]) < 40;
  const thumb = thumbAway && thumbStraight;

  return {
    thumb,
    fingers,
    pattern: `${thumb ? 1 : 0}${fingers.map((f) => (f ? 1 : 0)).join("")}`,
  };
}

/** Angutha aur index ki tip mil rahi hai? (OK / pinch) */
function thumbIndexTouch(w: P[]) {
  return dist(w[4], w[8]) / palmSize(w) < 0.35;
}

/** Saari ungliyon ki tips ek jagah ikatthi (khana wala gesture) */
function bunched(w: P[]) {
  const tips = [4, 8, 12, 16, 20].map((i) => w[i]);
  const palm = palmSize(w);
  let max = 0;
  for (let i = 0; i < tips.length; i++)
    for (let j = i + 1; j < tips.length; j++) max = Math.max(max, dist(tips[i], tips[j]));
  // tips paas paas hon, lekin mutthi jaise palm mein ghuse na hon
  const reach = dist(w[12], w[0]) / palm;
  return max / palm < 0.55 && reach > 1.2;
}

export function classifyHand(hand: Hand): string | null {
  const w = hand.world;
  const img = hand.image;
  const s = handState(hand);
  const [, m, r, p] = s.fingers;

  if (bunched(w)) return "khana";
  if (thumbIndexTouch(w)) {
    if (m && r && p) return "ok";
    // Mutthi mein bhi angutha index ke paas hota hai; pinch mein angutha palm se bahar rehta hai.
    if (!m && !r && !p && dist(w[4], w[9]) / palmSize(w) > 0.5) return "thoda";
  }

  switch (s.pattern) {
    case "11111":
    case "01111":
      return "namaste";
    case "00000":
      return "ruko";
    case "10000": {
      // Angutha upar ya neeche? Image coordinates mein tip vs jad.
      const dx = img[4].x - img[2].x;
      const dy = img[4].y - img[2].y;
      if (Math.abs(dy) < Math.abs(dx) * 0.8) return null;
      return dy < 0 ? "haan" : "nahi";
    }
    case "01000": {
      const dx = img[8].x - img[5].x;
      const dy = img[8].y - img[5].y;
      if (dy < 0 && Math.abs(dy) > Math.abs(dx)) return "ek-minute";
      if (Math.abs(dx) > Math.abs(dy) * 1.2) return "wahan";
      return null;
    }
    case "11000":
      return "kahan";
    case "01100":
    case "11100":
      return "theek";
    case "01110":
      return "paani";
    case "00001":
      return "washroom";
    case "10001":
      return "phone";
    case "11001":
      return "pyaar";
    case "01001":
      return "zabardast";
  }
  return null;
}

/** Dono haath ek saath (namaste, madad, bahut badhiya). */
export function classifyTwoHands(a: Hand, b: Hand, aSign: string | null, bSign: string | null): string | null {
  const open = (s: string | null) => s === "namaste";
  if (open(aSign) && open(bSign)) {
    const ca = a.image[9];
    const cb = b.image[9];
    return dist2d(ca, cb) < 0.22 ? "dhanyavaad" : "madad";
  }
  if (aSign === "haan" && bSign === "haan") return "badhiya";
  return null;
}

export function classifyFrame(hands: Hand[]): { signId: string | null; states: HandState[] } {
  const states = hands.map(handState);
  const signs = hands.map(classifyHand);
  if (hands.length >= 2) {
    const both = classifyTwoHands(hands[0], hands[1], signs[0], signs[1]);
    if (both) return { signId: both, states };
  }
  // Ek haath ka sign: jo haath frame mein bada (camera ke paas) ho, use priority.
  let best: string | null = null;
  let bestSize = 0;
  hands.forEach((h, idx) => {
    const size = dist2d(h.image[0], h.image[9]);
    if (signs[idx] && size > bestSize) {
      best = signs[idx];
      bestSize = size;
    }
  });
  return { signId: best, states };
}
