/**
 * @author Ramprasad
 * @module store — atomic file-backed receipt log (last 100 paid requests).
 *
 * Env deps: none (path passed in; defaults to <cwd>/data/receipts.json).
 *
 * Writes go through a temp-file + rename so a crash can never leave a
 * half-written receipts.json. Corrupt files boot empty (logged, never fatal).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { PaymentReceipt } from './hashscan.js';

export const MAX_RECEIPTS = 100;

export function receiptsFile(cwd: string = process.cwd()): string {
  return path.join(cwd, 'data', 'receipts.json');
}

export function loadReceipts(file: string = receiptsFile()): PaymentReceipt[] {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PaymentReceipt[]).slice(0, MAX_RECEIPTS) : [];
  } catch (err) {
    console.warn(`[store] receipts file unreadable, starting empty: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

/** Prepend a receipt, cap at MAX_RECEIPTS, persist atomically. Never throws. */
export function recordReceipt(
  receipts: PaymentReceipt[],
  receipt: PaymentReceipt,
  file: string = receiptsFile(),
): PaymentReceipt[] {
  receipts.unshift(receipt);
  if (receipts.length > MAX_RECEIPTS) receipts.length = MAX_RECEIPTS;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(receipts, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    // best-effort persist — a failed write never fails the paid request
  }
  return receipts;
}
