import { timingSafeEqual } from "node:crypto";
export function validDeviceKey(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string" || expected.length < 32) return false;
  const left = Buffer.from(provided), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
