/**
 * Har frame ki prediction thodi hilti rehti hai. Ye class tabhi sign "fire" karti hai
 * jab wahi sign `holdMs` tak lagataar dikhe, aur fir `cooldownMs` tak dobara nahi bolti.
 * Same sign dobara bulwane ke liye haath hatana (ya doosra sign) zaroori hai.
 */
export class SignStabilizer {
  private current: string | null = null;
  private since = 0;
  private lastFired: string | null = null;
  private lastFiredAt = 0;
  private released = true;

  constructor(
    public holdMs = 700,
    public cooldownMs = 2500,
  ) {}

  /** Progress 0..1 (UI ke ring ke liye) aur agar sign fire hua to uska label. */
  update(label: string | null, now: number): { progress: number; fired: string | null; label: string | null } {
    if (label !== this.current) {
      this.current = label;
      this.since = now;
    }
    if (label === null) {
      this.released = true;
      return { progress: 0, fired: null, label: null };
    }
    if (label !== this.lastFired) this.released = true;

    const progress = Math.min(1, (now - this.since) / this.holdMs);
    const coolingDown = label === this.lastFired && now - this.lastFiredAt < this.cooldownMs;
    if (progress >= 1 && this.released && !coolingDown) {
      this.lastFired = label;
      this.lastFiredAt = now;
      this.released = false;
      return { progress: 1, fired: label, label };
    }
    return { progress: this.released ? progress : 1, fired: null, label };
  }

  reset() {
    this.current = null;
    this.lastFired = null;
    this.released = true;
  }
}
