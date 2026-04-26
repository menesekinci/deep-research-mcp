import { createHash } from "node:crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function newId(prefix: string): string {
  const random = createHash("sha256").update(`${prefix}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 20);
  return `${prefix}_${random}`;
}
