/** In-memory fixed-window rate buckets (SPEC §12 v1). */

export type BucketResult = { allowed: true } | { allowed: false; retryAfterSec: number };

type WindowCounter = { count: number; windowStartMs: number };

export class FixedWindowBucket {
  private readonly store = new Map<string, WindowCounter>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  consume(key: string, nowMs = Date.now()): BucketResult {
    const entry = this.store.get(key);
    if (!entry || nowMs - entry.windowStartMs >= this.windowMs) {
      this.store.set(key, { count: 1, windowStartMs: nowMs });
      return { allowed: true };
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((entry.windowStartMs + this.windowMs - nowMs) / 1000),
      );
      return { allowed: false, retryAfterSec };
    }
    return { allowed: true };
  }

  reset(): void {
    this.store.clear();
  }
}

/** Token-bucket-ish burst: allow `burst` immediate then `limit` per window. */
export class GuildRateLimiter {
  private readonly window: FixedWindowBucket;
  private burstRemaining: number;

  constructor(
    private readonly limitPerMin: number,
    burst: number,
  ) {
    this.window = new FixedWindowBucket(limitPerMin, 60_000);
    this.burstRemaining = burst;
  }

  consume(guildId: string, nowMs = Date.now()): BucketResult {
    if (this.burstRemaining > 0) {
      this.burstRemaining -= 1;
      return { allowed: true };
    }
    return this.window.consume(guildId, nowMs);
  }

  reset(): void {
    this.burstRemaining = this.limitPerMin;
    this.window.reset();
  }
}

/** Process-wide ~RPS cap using 1s windows. */
export class ProcessRpsLimiter {
  private readonly window: FixedWindowBucket;

  constructor(rps: number) {
    this.window = new FixedWindowBucket(rps, 1000);
  }

  consume(nowMs = Date.now()): BucketResult {
    return this.window.consume("process", nowMs);
  }

  reset(): void {
    this.window.reset();
  }
}
