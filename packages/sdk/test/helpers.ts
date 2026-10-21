import { type Address, type Hex, localSigner, Varanasi } from "../src/index.js";

// Well known anvil test keys. Test money only; never fund these on a real network.
export const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex; // gitleaks:allow public anvil dev key, test only
export const OWNER2_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex; // gitleaks:allow public anvil dev key, test only
export const owner = localSigner(OWNER_KEY);
export const owner2 = localSigner(OWNER2_KEY);
export const AGENT = "0x00000000000000000000000000000000000a6e01" as Address;
export const AGENT2 = "0x00000000000000000000000000000000000a6e02" as Address;
export const TOKEN = "0x0000000000000000000000000000000000005d01" as Address;
export const TOKEN2 = "0x0000000000000000000000000000000000005d02" as Address;
export const PAYEE = "0x00000000000000000000000000000000000b0b01" as Address;
export const PAYEE2 = "0x00000000000000000000000000000000000b0b02" as Address;
export const T0 = 1_800_000_000n;

/** Sandbox with a controllable clock. */
export function sandbox(start: bigint = T0) {
  const clock = { now: start };
  const v = Varanasi.sandbox({ clock: () => clock.now });
  return { v, clock };
}

let n = 0;
export function pid(): string {
  n += 1;
  return `pay-${n}`;
}
