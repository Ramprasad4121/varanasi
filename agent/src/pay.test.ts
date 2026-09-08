import { describe, it, expect } from "vitest";
import {
  derivePaidReceipt,
  hashscanTxUrl,
  isAllowedSignalUrl,
  isValidHederaTxId,
} from "./pay.js";

const VALID_TX = "0.0.123-1697836800-123456789";
const VALID_TX_AT = "0.0.123@1697836800.123456789";

function b64(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString("base64");
}

function headers(h: Record<string, string>) {
  return (name: string) => h[name.toLowerCase()] ?? h[name] ?? null;
}

describe("isValidHederaTxId (allowlist)", () => {
  it("accepts @ and dash forms", () => {
    expect(isValidHederaTxId(VALID_TX)).toBe(true);
    expect(isValidHederaTxId(VALID_TX_AT)).toBe(true);
  });
  it("rejects base64 blobs, raw hashes, and junk", () => {
    expect(isValidHederaTxId("aGVsbG8td29ybGQ=")).toBe(false);
    expect(isValidHederaTxId("0x" + "ab".repeat(32))).toBe(false);
    expect(isValidHederaTxId("")).toBe(false);
    expect(isValidHederaTxId(null)).toBe(false);
    expect(isValidHederaTxId(123)).toBe(false);
  });
});

describe("derivePaidReceipt (H7: header-only paid)", () => {
  it("paid=true when the header decodes to an allowlisted tx id", () => {
    const r = derivePaidReceipt({ signal: "LONG" }, headers({ "payment-response": b64({ transaction: VALID_TX }) }), "testnet");
    expect(r.paid).toBe(true);
    expect(r.txHash).toBe(VALID_TX);
    expect(r.hashscanUrl).toBe(hashscanTxUrl(VALID_TX, "testnet"));
  });

  it("REJECTS paid-spoof: payload claims a txId but no header → paid:false", () => {
    const r = derivePaidReceipt(
      { signal: "LONG", txId: VALID_TX, receipt: { txId: VALID_TX } },
      headers({}),
      "testnet",
    );
    expect(r.paid).toBe(false);
    expect(r.txHash).toBeNull();
    expect(r.hashscanUrl).toBeNull();
    expect(r.payloadHint).toBe(VALID_TX); // display-only hint preserved
  });

  it("paid:false on undecodable header even when payload claims paid", () => {
    const r = derivePaidReceipt(
      { txHash: VALID_TX },
      headers({ "payment-response": "!!!not-base64!!!" }),
      "testnet",
    );
    expect(r.paid).toBe(false);
    expect(r.txHash).toBeNull();
  });

  it("paid:false when the header decodes but carries no allowlisted tx id", () => {
    const r = derivePaidReceipt({ txId: VALID_TX }, headers({ "payment-response": b64({ foo: "bar" }) }), "testnet");
    expect(r.paid).toBe(false);
    expect(r.txHash).toBeNull();
    expect(r.payloadHint).toBe(VALID_TX);
  });

  it("paid:false when the header decodes to a non-tx string", () => {
    const r = derivePaidReceipt({}, headers({ "payment-response": b64({ transaction: "aGVsbG8=" }) }), "testnet");
    expect(r.paid).toBe(false);
  });
});

describe("isAllowedSignalUrl (M14: https or localhost-http only)", () => {
  it("allows https remotes", () => {
    expect(isAllowedSignalUrl("https://signals.example.com/v1/signal")).toBe(true);
  });
  it("allows localhost http(s)", () => {
    expect(isAllowedSignalUrl("http://localhost:3001/v1/signal")).toBe(true);
    expect(isAllowedSignalUrl("http://127.0.0.1:3001/v1/signal")).toBe(true);
    expect(isAllowedSignalUrl("https://localhost:3001/v1/signal")).toBe(true);
  });
  it("refuses plain-http remotes incl. intranet hosts", () => {
    expect(isAllowedSignalUrl("http://signals.example.com/v1/signal")).toBe(false);
    expect(isAllowedSignalUrl("http://192.168.1.10:3001/v1/signal")).toBe(false);
    expect(isAllowedSignalUrl("http://10.0.0.5/v1/signal")).toBe(false);
    expect(isAllowedSignalUrl("http://localhost.evil.com/v1/signal")).toBe(false);
    expect(isAllowedSignalUrl("not-a-url")).toBe(false);
  });
});
