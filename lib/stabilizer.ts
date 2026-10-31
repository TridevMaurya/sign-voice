/**
 * Har frame ki prediction thodi hilti rehti hai. Ye class sign tabhi "fire" karti hai
 * jab wahi sign `holdMs` tak lagataar dikhe. Same sign dobara bulwane ke liye haath
 * hatana ya doosra sign dikhana zaroori hai (1-2 frame ki jhilmil ko ignore karti hai).
 */
export class SignStabilizer {
  private candidate: string | null = null;
  private since = 0;
  private lastFired: string | null = null;
  private lastFiredAt = 0;
  private released = true;

  constructor(
    public holdMs = 400,
    public cooldownMs = 1500,
    public releaseMs = 250,
  ) {}

  /** progress 0..1 (UI ki line ke liye), aur agar sign abhi fire hua to uski id. */
  update(label: string | null, now: number): { progress: number; fired: string | null } {
    if (label !== this.candidate) {
      this.candidate = label;
      this.since = now;
    }
    const held = now - this.since;

    if (label === null) {
      if (held > this.releaseMs) this.released = true;
      return { progress: 0, fired: null };
    }
    if (label !== this.lastFired && held > this.releaseMs) this.released = true;

    const coolingDown = label === this.lastFired && now - this.lastFiredAt < this.cooldownMs;
    if (held >= this.holdMs && this.released && !coolingDown) {
      this.lastFired = label;
      this.lastFiredAt = now;
      this.released = false;
      return { progress: 1, fired: label };
    }
    return { progress: label === this.lastFired && !this.released ? 1 : Math.min(1, held / this.holdMs), fired: null };
  }
}
