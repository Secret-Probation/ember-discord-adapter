/** Prometheus counters and histograms (SPEC §13 observability). */

type LabelSet = Record<string, string>;

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

function labelKey(labels: LabelSet): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}="${escapeLabelValue(labels[k] ?? "")}"`)
    .join(",");
}

class Counter {
  private readonly name: string;
  private readonly help: string;
  private readonly labelNames: string[];
  private readonly values = new Map<string, number>();

  constructor(name: string, help: string, labelNames: string[] = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  inc(labels: LabelSet = {}, amount = 1): void {
    for (const key of this.labelNames) {
      if (!(key in labels)) {
        throw new Error(`missing label ${key} for ${this.name}`);
      }
    }
    const k = labelKey(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + amount);
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
      return lines.join("\n");
    }
    for (const [k, v] of this.values.entries()) {
      const labelPart = k ? `{${k}}` : "";
      lines.push(`${this.name}${labelPart} ${v}`);
    }
    return lines.join("\n");
  }
}

const DEFAULT_HISTOGRAM_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
];

class Histogram {
  private readonly name: string;
  private readonly help: string;
  private readonly labelNames: string[];
  private readonly buckets: number[];
  private readonly series = new Map<
    string,
    { sum: number; count: number; bucketCounts: number[] }
  >();

  constructor(name: string, help: string, labelNames: string[] = [], buckets = DEFAULT_HISTOGRAM_BUCKETS) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.buckets = [...buckets].sort((a, b) => a - b);
  }

  observe(labels: LabelSet, valueSeconds: number): void {
    for (const key of this.labelNames) {
      if (!(key in labels)) {
        throw new Error(`missing label ${key} for ${this.name}`);
      }
    }
    const k = labelKey(labels);
    let row = this.series.get(k);
    if (!row) {
      row = { sum: 0, count: 0, bucketCounts: new Array(this.buckets.length + 1).fill(0) };
      this.series.set(k, row);
    }
    row.sum += valueSeconds;
    row.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (valueSeconds <= this.buckets[i]!) {
        row.bucketCounts[i]! += 1;
      }
    }
    row.bucketCounts[this.buckets.length]! += 1;
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    if (this.series.size === 0) {
      lines.push(`${this.name}_count 0`);
      lines.push(`${this.name}_sum 0`);
      return lines.join("\n");
    }
    for (const [k, row] of this.series.entries()) {
      for (let i = 0; i < this.buckets.length; i++) {
        const le = this.buckets[i]!;
        const bucketLabels = k ? `{${k},le="${le}"}` : `{le="${le}"}`;
        lines.push(`${this.name}_bucket${bucketLabels} ${row.bucketCounts[i]}`);
      }
      const infLabels = k ? `{${k},le="+Inf"}` : `{le="+Inf"}`;
      lines.push(`${this.name}_bucket${infLabels} ${row.bucketCounts[this.buckets.length]}`);
      const countLabels = k ? `{${k}}` : "";
      lines.push(`${this.name}_count${countLabels} ${row.count}`);
      lines.push(`${this.name}_sum${countLabels} ${row.sum}`);
    }
    return lines.join("\n");
  }
}

/** Increment when AD-6 posts a public channel message. */
export function recordPostToChannel(): void {
  postToChannelTotal.inc();
}

export const signatureVerifyTotal = new Counter(
  "ember_discord_signature_verify_total",
  "Discord interaction signature verification outcomes",
  ["result"],
);

export const interactionUnauthorizedTotal = new Counter(
  "ember_discord_interaction_unauthorized_total",
  "Interaction requests rejected before fan-query (401/429 unsigned bucket)",
  ["reason"],
);

export const commandsTotal = new Counter(
  "ember_discord_commands_total",
  "Slash commands accepted for defer (by mode)",
  ["mode"],
);

export const postToChannelTotal = new Counter(
  "ember_discord_post_to_channel_total",
  "Successful public channel posts from Ask/search share button",
);

export const guildInstallTotal = new Counter(
  "ember_discord_guild_install_total",
  "OAuth callbacks that created a pending guild binding",
);

export const deferLatencySeconds = new Histogram(
  "ember_discord_defer_latency_seconds",
  "Time from handler entry to deferred ack for application commands",
);

export const fanQueryLatencySeconds = new Histogram(
  "ember_discord_fan_query_latency_seconds",
  "Control plane fan-query round-trip latency",
  ["mode"],
);

export const webhookResponseTotal = new Counter(
  "ember_discord_webhook_response_total",
  "Discord interaction webhook HTTP responses by status class",
  ["status"],
);

/** Record webhook status; highlights 429 and 403 per SPEC §13. */
export function recordWebhookHttpStatus(status: number): void {
  webhookResponseTotal.inc({ status: String(status) });
}

export function renderPrometheusMetrics(): string {
  return [
    signatureVerifyTotal.render(),
    interactionUnauthorizedTotal.render(),
    commandsTotal.render(),
    postToChannelTotal.render(),
    guildInstallTotal.render(),
    deferLatencySeconds.render(),
    fanQueryLatencySeconds.render(),
    webhookResponseTotal.render(),
  ].join("\n\n");
}
