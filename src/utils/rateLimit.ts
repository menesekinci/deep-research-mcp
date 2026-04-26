export interface ParsedRateLimitHeaders {
  limit?: string;
  policy?: string;
  remaining?: string;
  reset?: string;
  nextAllowedAt?: Date;
}

export function parseRateLimitHeaders(headers: Headers): ParsedRateLimitHeaders {
  const limit = headers.get("x-ratelimit-limit") ?? undefined;
  const policy = headers.get("x-ratelimit-policy") ?? undefined;
  const remaining = headers.get("x-ratelimit-remaining") ?? undefined;
  const reset = headers.get("x-ratelimit-reset") ?? undefined;
  const nextAllowedAt = nextAllowedFromHeaders(remaining, reset);
  return { limit, policy, remaining, reset, nextAllowedAt };
}

export function nextAllowedFromHeaders(remaining?: string, reset?: string): Date | undefined {
  if (!remaining || !reset) {
    return undefined;
  }
  const remainingParts = remaining.split(",").map((part) => Number.parseInt(part.trim(), 10));
  const resetParts = reset.split(",").map((part) => Number.parseInt(part.trim(), 10));
  const waitSeconds = remainingParts.reduce((maxWait, value, index) => {
    if (Number.isFinite(value) && value <= 0) {
      const resetValue = resetParts[index];
      if (Number.isFinite(resetValue)) {
        return Math.max(maxWait, resetValue);
      }
    }
    return maxWait;
  }, 0);
  return waitSeconds > 0 ? new Date(Date.now() + waitSeconds * 1000) : undefined;
}
