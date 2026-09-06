/**
 * Hedera Consensus Service (HCS) audit trail for paid x402 requests.
 *
 * After a paid `/v1/signal` or `/v1/score` request is served, the service
 * fire-and-forgets a JSON receipt
 * `{route, payTo, txId, amount, asset, servedAt}` to an HCS topic via
 * `TopicMessageSubmitTransaction`. Anyone can then verify the payment trail
 * on HashScan at `https://hashscan.io/<testnet|mainnet>/topic/<TOPIC_ID>`.
 *
 * Design constraints:
 * - BEST-EFFORT ONLY: `logReceipt` never throws and never fails the paid
 *   request. Every failure path returns `{skipped: reason}` after a
 *   `console.warn`, and the caller (`server.ts`) invokes it detached (`void`).
 * - Topic lifecycle: `getOrCreateTopic` reuses `HCS_TOPIC_ID` when set,
 *   otherwise creates one topic with the operator key on first use, caches
 *   the id in memory, and prints it so the operator can persist it via
 *   `HCS_TOPIC_ID` (avoids a create-tx on every restart).
 * - Secrets: private keys are read from env only, used to sign, and NEVER
 *   printed or included in messages.
 */

import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from '@hiero-ledger/sdk';

/** Receipt fields mirrored to HCS (amount/asset describe the route price). */
export interface HcsReceiptInput {
  route: string;
  payTo: string;
  txId: string | null;
  amount?: string | null;
  asset?: string | null;
  servedAt?: string;
}

export type HcsLogResult = { topicId: string; sequenceNumber: string } | { skipped: string };

/** In-memory topic cache — survives for the process lifetime. */
let cachedTopicId: string | null = null;
/** In-flight creation guard so concurrent paid requests create at most one topic. */
let pendingTopic: Promise<string | null> | null = null;

function hcsEnabled(): boolean {
  const raw = (process.env.HCS_ENABLED ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'no' && raw !== 'off';
}

function isMainnet(): boolean {
  return (process.env.HEDERA_NETWORK ?? 'testnet').trim().toLowerCase() === 'mainnet';
}

function operatorCreds(): { accountId: string; privateKey: string } | null {
  const accountId = (process.env.HEDERA_SERVICE_ACCOUNT_ID ?? '').trim();
  const privateKey = (process.env.HEDERA_SERVICE_PRIVATE_KEY ?? '').trim();
  // Reject unset/placeholder values (see service/.env.example) — never attempt
  // network calls with them, and never print the key itself.
  if (!accountId || !privateKey || privateKey.includes('XXXX') || privateKey === '0x...') {
    return null;
  }
  return { accountId, privateKey };
}

function newOperator(): { client: Client; key: PrivateKey } | null {
  const creds = operatorCreds();
  if (!creds) return null;
  try {
    let key: PrivateKey;
    try {
      key = PrivateKey.fromStringECDSA(creds.privateKey);
    } catch {
      key = PrivateKey.fromString(creds.privateKey);
    }
    const client = isMainnet() ? Client.forMainnet() : Client.forTestnet();
    client.setOperator(creds.accountId, key);
    return { client, key };
  } catch (err) {
    console.warn('[hcs] operator client setup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function closeQuietly(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // Ignore — closing is cosmetic.
  }
}

async function createTopicOnce(): Promise<string | null> {
  try {
    const envTopic = (process.env.HCS_TOPIC_ID ?? '').trim();
    if (envTopic) {
      cachedTopicId = envTopic;
      return cachedTopicId;
    }
    if (!hcsEnabled()) return null;
    const op = newOperator();
    if (!op) {
      console.warn('[hcs] skipping topic creation: operator credentials missing/unset.');
      return null;
    }
    try {
      const txResponse = await new TopicCreateTransaction()
        .setTopicMemo('varanasi x402 payment audit trail')
        .setAdminKey(op.key.publicKey)
        .setSubmitKey(op.key.publicKey)
        .execute(op.client);
      const receipt = await txResponse.getReceipt(op.client);
      const topicId = receipt.topicId?.toString() ?? null;
      if (!topicId) {
        console.warn('[hcs] topic creation returned no topic id.');
        return null;
      }
      cachedTopicId = topicId;
      console.log(`[hcs] created audit topic ${topicId} — persist it via HCS_TOPIC_ID=${topicId}`);
      return topicId;
    } finally {
      await closeQuietly(op.client);
    }
  } catch (err) {
    console.warn('[hcs] topic creation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Resolve the audit topic id: memory cache -> `HCS_TOPIC_ID` env ->
 * one-time auto-create with the operator key. Returns null (never throws)
 * when HCS is disabled, unconfigured, or the network call fails.
 */
export function getOrCreateTopic(): Promise<string | null> {
  if (cachedTopicId) return Promise.resolve(cachedTopicId);
  if (!pendingTopic) {
    pendingTopic = createTopicOnce().finally(() => {
      pendingTopic = null;
    });
  }
  return pendingTopic;
}

/**
 * Submit a paid-request receipt to the HCS audit topic. Best-effort: on ANY
 * failure returns `{skipped: reason}` — the paid request MUST NOT fail
 * because of HCS. Callers should invoke detached (`void logReceipt(...)`)
 * AFTER the paid response has been served.
 */
export async function logReceipt(input: HcsReceiptInput): Promise<HcsLogResult> {
  try {
    if (!hcsEnabled()) return { skipped: 'HCS_ENABLED=0' };
    const topicId = await getOrCreateTopic();
    if (!topicId) return { skipped: 'no-topic (operator credentials missing or HCS error)' };
    const op = newOperator();
    if (!op) return { skipped: 'operator credentials missing' };
    try {
      const message = JSON.stringify({
        route: input.route,
        payTo: input.payTo,
        txId: input.txId,
        amount: input.amount ?? null,
        asset: input.asset ?? null,
        servedAt: input.servedAt ?? new Date().toISOString(),
        network: isMainnet() ? 'hedera:mainnet' : 'hedera:testnet',
      });
      const txResponse = await new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .execute(op.client);
      const receipt = await txResponse.getReceipt(op.client);
      const seqRaw = (receipt as unknown as { topicSequenceNumber?: unknown }).topicSequenceNumber;
      const sequenceNumber =
        typeof seqRaw === 'object' && seqRaw !== null && 'toString' in seqRaw
          ? String((seqRaw as { toString(): string }).toString())
          : String(seqRaw ?? '');
      console.log(`[hcs] receipt logged: topic=${topicId} seq=${sequenceNumber} route=${input.route}`);
      return { topicId, sequenceNumber };
    } finally {
      await closeQuietly(op.client);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn('[hcs] logReceipt failed (paid request unaffected):', reason);
    return { skipped: reason };
  }
}
