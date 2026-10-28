import crypto from "node:crypto";

const BEARER_PREFIX = "Bearer ";

/** Constant-time compare for Authorization: Bearer secrets (SPEC §4). */
export function timingSafeBearerMatch(
  providedAuthorization: string | null,
  secret: string,
): boolean {
  const expected = `${BEARER_PREFIX}${secret}`;
  const actual = providedAuthorization ?? "";
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(actual, "utf8");
  if (expectedBuf.length !== actualBuf.length) {
    crypto.timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
