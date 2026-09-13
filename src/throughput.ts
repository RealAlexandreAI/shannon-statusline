import type { ResponseThroughput } from "./types.js";

export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatThroughputText(throughput: ResponseThroughput | null): string | null {
  if (!throughput || throughput.outputTokens <= 0) return null;

  const parts: string[] = [];
  if (throughput.ttftMs !== null) parts.push(`TTFT~${formatLatency(throughput.ttftMs)}`);
  if (throughput.tokensPerSecond !== null) {
    parts.push(`↓ ~${throughput.tokensPerSecond.toFixed(1)} tok/s`);
  }
  parts.push(`~${formatTokens(throughput.outputTokens)} tok`);
  return parts.join(" · ");
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}
