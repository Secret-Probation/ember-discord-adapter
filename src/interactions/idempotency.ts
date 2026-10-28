/** Prevent duplicate fan-query for the same interaction id (SPEC §10, §19). */

export class InteractionIdempotency {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs: number) {}

  /** Returns true if this is the first claim for id. */
  claim(interactionId: string, nowMs = Date.now()): boolean {
    this.prune(nowMs);
    if (this.seen.has(interactionId)) {
      return false;
    }
    this.seen.set(interactionId, nowMs + this.ttlMs);
    return true;
  }

  private prune(nowMs: number): void {
    for (const [id, expires] of this.seen.entries()) {
      if (expires <= nowMs) {
        this.seen.delete(id);
      }
    }
  }

  reset(): void {
    this.seen.clear();
  }
}
