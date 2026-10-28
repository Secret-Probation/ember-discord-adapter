import nacl from "tweetnacl";

/** Fixed Ed25519 pair for unit tests (generated once; not a production secret). */
export const TEST_PUBLIC_KEY =
  "7ba42a2379026101a018db93d9f2818345ba9f7251039245f856ea3127949c0e";

const TEST_SECRET_KEY = Buffer.from(
  "7c5d145291878427481f18e1bad930151243e25fc0916e70ac4d24d64e602e3d7ba42a2379026101a018db93d9f2818345ba9f7251039245f856ea3127949c0e",
  "hex",
);

/** Sign raw body the way Discord does (timestamp + body). */
export function signDiscordBody(body: string, timestamp: string): { signature: string; timestamp: string } {
  const message = new TextEncoder().encode(timestamp + body);
  const sig = nacl.sign.detached(message, TEST_SECRET_KEY);
  return { signature: Buffer.from(sig).toString("hex"), timestamp };
}
