// All time goes through an injected clock (D-42). Demo Control can move the server clock forward.
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

/** The server's clock: real time plus an offset the presenter can advance ("tua đồng hồ"). */
export class AdjustableClock implements Clock {
  private offsetMs = 0;
  private readonly base: Clock;

  constructor(base: Clock = systemClock) {
    this.base = base;
  }

  now(): number {
    return this.base.now() + this.offsetMs;
  }

  get offset(): number {
    return this.offsetMs;
  }

  advance(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) throw new Error("The clock only moves forward");
    this.offsetMs += ms;
  }

  resetOffset(): void {
    this.offsetMs = 0;
  }
}
