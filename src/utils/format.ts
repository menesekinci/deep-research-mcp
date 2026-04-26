export type OutputFormat = "json" | "markdown" | "toon";

export function formatPayload(value: unknown, format: OutputFormat = "json"): string {
  if (format === "markdown" && typeof value === "string") {
    return value;
  }
  if (format === "toon") {
    return toToon(value);
  }
  return JSON.stringify(value, null, 2);
}

function toToon(value: unknown): string {
  if (!Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }
  if (value.length === 0) {
    return "items[0]{}";
  }
  const keys = Object.keys(value[0] as Record<string, unknown>);
  if (!value.every((item) => keys.join("\0") === Object.keys(item as Record<string, unknown>).join("\0"))) {
    return JSON.stringify(value, null, 2);
  }
  const lines = [`items[${value.length}]{${keys.join(",")}}:`];
  for (const item of value as Record<string, unknown>[]) {
    lines.push(keys.map((key) => scalar(item[key])).join(","));
  }
  return lines.join("\n");
}

function scalar(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value).replaceAll("\n", "\\n");
}
