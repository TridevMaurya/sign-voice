import type { Category, NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Hand landmarks se ek fixed-length feature vector banata hai:
 * har haath ke 21 points, wrist ke relative aur haath ke size se normalize,
 * taaki camera se doori ya frame mein position se farak na pade.
 * Layout: [Left hand 63 values][Right hand 63 values][leftPresent, rightPresent]
 */
export const FEATURE_LENGTH = 21 * 3 * 2 + 2;

function normalizeHand(hand: NormalizedLandmark[]): number[] {
  const wrist = hand[0];
  let scale = 0;
  for (const p of hand) {
    const d = Math.hypot(p.x - wrist.x, p.y - wrist.y);
    if (d > scale) scale = d;
  }
  scale = scale || 1;
  const out: number[] = [];
  for (const p of hand) {
    out.push((p.x - wrist.x) / scale, (p.y - wrist.y) / scale, (p.z - wrist.z) / scale);
  }
  return out;
}

export function extractFeatures(
  landmarks: NormalizedLandmark[][],
  handedness: Category[][],
): number[] | null {
  if (!landmarks.length) return null;
  const slots: (number[] | null)[] = [null, null];
  landmarks.forEach((hand, i) => {
    // MediaPipe handedness mirrored video ke hisaab se hoti hai; humein sirf consistent slot chahiye.
    const side = handedness[i]?.[0]?.categoryName === "Right" ? 1 : 0;
    const slot = slots[side] ? 1 - side : side;
    slots[slot] = normalizeHand(hand);
  });
  const zeros = new Array(63).fill(0);
  return [...(slots[0] ?? zeros), ...(slots[1] ?? zeros), slots[0] ? 1 : 0, slots[1] ? 1 : 0];
}

export type Sample = { label: string; features: number[] };

export type Prediction = { label: string; confidence: number };

/**
 * Simple k-nearest-neighbours classifier. 4-5 signs aur ~40 samples per sign ke liye
 * ye browser mein instantly train hota hai aur kaafi accurate hai.
 */
export class KnnClassifier {
  samples: Sample[] = [];

  constructor(samples: Sample[] = []) {
    this.samples = samples;
  }

  add(label: string, features: number[]) {
    this.samples.push({ label, features });
  }

  clearLabel(label: string) {
    this.samples = this.samples.filter((s) => s.label !== label);
  }

  countByLabel(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const s of this.samples) counts[s.label] = (counts[s.label] ?? 0) + 1;
    return counts;
  }

  get labelCount() {
    return Object.keys(this.countByLabel()).length;
  }

  predict(features: number[], k = 7, maxDistance = 2.2): Prediction | null {
    if (!this.samples.length) return null;
    const dists = this.samples.map((s) => ({ label: s.label, d: distance(features, s.features) }));
    dists.sort((a, b) => a.d - b.d);
    const nearest = dists.slice(0, Math.min(k, dists.length));
    // Agar sabse paas wala sample bhi bahut door hai, to ye koi trained sign nahi hai.
    if (nearest[0].d > maxDistance) return null;

    const votes: Record<string, number> = {};
    for (const n of nearest) votes[n.label] = (votes[n.label] ?? 0) + 1 / (n.d + 1e-3);
    let best = "";
    let bestScore = 0;
    let total = 0;
    for (const [label, score] of Object.entries(votes)) {
      total += score;
      if (score > bestScore) {
        best = label;
        bestScore = score;
      }
    }
    return { label: best, confidence: bestScore / total };
  }
}

function distance(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

const STORAGE_KEY = "signvoice.samples.v1";

export function loadSamples(): Sample[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => s?.features?.length === FEATURE_LENGTH) : [];
  } catch {
    return [];
  }
}

export function saveSamples(samples: Sample[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch {
    // Storage full ya blocked — training sirf is session tak rahegi.
  }
}
