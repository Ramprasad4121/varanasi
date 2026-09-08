import { describe, it, expect } from "vitest";
import { isIdentityAuthorized, splitSubname } from "./ens.js";

describe("isIdentityAuthorized (M14: ENS mismatch FAILS authorization)", () => {
  it("authorized when registry says yes and ENS agrees", () => {
    expect(isIdentityAuthorized({ authorized: true, ensMatchesRegistry: true })).toBe(true);
  });
  it("authorized when the ENS leg was skipped (registry-only)", () => {
    expect(isIdentityAuthorized({ authorized: true, ensMatchesRegistry: null })).toBe(true);
  });
  it("FAILS when ENS disagrees, even with registry approval", () => {
    expect(isIdentityAuthorized({ authorized: true, ensMatchesRegistry: false })).toBe(false);
  });
  it("FAILS when the registry itself says no", () => {
    expect(isIdentityAuthorized({ authorized: false, ensMatchesRegistry: true })).toBe(false);
    expect(isIdentityAuthorized({ authorized: false, ensMatchesRegistry: null })).toBe(false);
  });
});

describe("splitSubname", () => {
  it("splits label and parent", () => {
    expect(splitSubname("agent-1.aegis.eth")).toEqual({ sublabel: "agent-1", parent: "aegis.eth" });
  });
  it("rejects bare names", () => {
    expect(() => splitSubname("no-dot")).toThrow("Invalid agent subname");
  });
});
