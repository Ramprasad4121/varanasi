/**
 * @author Ramprasad
 * classify.test.ts — unit tests for the server-side error classifier.
 * Run: npm test (node:test via tsx; Node >= 20).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyError, ERROR_CLASSES } from '../src/classify.js';

function pickFetch(choice: string, confidence: number): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ answers: { label: { choice, confidence } } }), { status: 200 })) as unknown as typeof fetch;
}

const OPTS = { enabled: true, apiKey: 'test-key' } as const;

test('skips without a key and on empty input (regex fallback wins)', async () => {
  assert.equal(await classifyError('LabelTaken'), null);
  assert.equal(await classifyError('', { ...OPTS, fetchImpl: pickFetch('label_taken', 0.99) }), null);
  assert.equal(await classifyError(null, { ...OPTS, fetchImpl: pickFetch('label_taken', 0.99) }), null);
});

test('returns the verbatim winning label on a confident pick', async () => {
  const out = await classifyError('execution reverted: LabelTaken()', {
    ...OPTS,
    fetchImpl: pickFetch('label_taken', 0.93),
  });
  assert.equal(out?.label, 'label_taken');
  assert.equal(out?.confidence, 0.93);
  assert.ok((ERROR_CLASSES as readonly string[]).includes(out?.label ?? ''));
});

test('falls back on low confidence, unknown labels, and verifier errors', async () => {
  assert.equal(
    await classifyError('boom', { ...OPTS, fetchImpl: pickFetch('label_taken', 0.2) }),
    null,
  );
  assert.equal(
    await classifyError('boom', { ...OPTS, fetchImpl: pickFetch('not_a_class', 0.99) }),
    null,
  );
  const broken = (async () => {
    throw new Error('verifier down');
  }) as unknown as typeof fetch;
  assert.equal(await classifyError('boom', { ...OPTS, fetchImpl: broken }), null);
});
