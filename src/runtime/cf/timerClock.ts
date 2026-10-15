/**
 * When a page's or subpage's timer runs (GUI Designer's "Setup Page Timers"):
 * it starts as its page or subpage shows, runs an interval after that and
 * every interval on, `repeat` times (0: on and on) while it shows, and starts
 * over the next time it shows. An interval of 0 doesn't run - except once
 * (repeat 1): then at once, as GUI Designer's own demos use it (a page's
 * setup command); a 0 changed to an interval (its join) starts it then.
 */
export class TimerClock {
  /** when the next run is due (null: not counting) */
  private next: number | null = null;
  /** runs since it last showed */
  private count = 0;

  constructor(private readonly repeat: number) {}

  /** `now` (ms), whether its page / subpage shows, the interval now: run it now? */
  tick(now: number, shown: boolean, interval: number): boolean {
    if (!shown) {
      this.next = null;
      this.count = 0;
      return false;
    }
    if (this.repeat > 0 && this.count >= this.repeat) return false;
    if (this.next === null) {
      if (interval <= 0) {
        if (this.repeat !== 1 || this.count > 0) return false;
        this.count = 1;
        return true;
      }
      this.next = now + interval;
    }
    if (now < this.next) return false;
    this.count++;
    this.next = interval > 0 ? now + interval : null;
    return true;
  }
}
