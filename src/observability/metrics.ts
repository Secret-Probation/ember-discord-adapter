/** Prometheus counters for adapter observability (SPEC §13). AD-7 extends this module. */

class Counter {
  private value = 0;

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(amount = 1): void {
    this.value += amount;
  }

  render(): string {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
      `${this.name} ${this.value}`,
    ].join("\n");
  }

  getValueForTests(): number {
    return this.value;
  }

  resetForTests(): void {
    this.value = 0;
  }
}

export const postToChannelTotal = new Counter(
  "ember_discord_post_to_channel_total",
  "Successful public channel posts from post-to-channel button",
);

export function recordPostToChannel(): void {
  postToChannelTotal.inc();
}

export function renderPrometheusMetrics(): string {
  return postToChannelTotal.render();
}
