/* The fade ticker's arithmetic, in isolation — the only part of the audio
   engine node can verify without a real <audio> element. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* audio.js touches document at import time, so the pure helper is
   re-implemented here against the same constants — if the module's STEP
   changes, this test's expectations document what the fade must still do. */
const STEP = 50 / 900;
const nextVolume = (v, t) => Math.abs(v - t) <= STEP ? t
  : Math.min(1, Math.max(0, v + (t > v ? STEP : -STEP)));

test('walks toward the target one step at a time and lands exactly', () => {
  let v = 0;
  const steps = [];
  while (v !== 1) { v = nextVolume(v, 1); steps.push(v); }
  assert.equal(v, 1);
  assert.ok(steps.length >= 17 && steps.length <= 19);   // ~900ms / 50ms
  while (v !== 0) v = nextVolume(v, 0);
  assert.equal(v, 0);
});

test('a fade never overshoots or leaves the [0,1] range', () => {
  assert.equal(nextVolume(0.99, 1), 1);
  assert.equal(nextVolume(0.01, 0), 0);
  assert.ok(nextVolume(0, 1) > 0 && nextVolume(0, 1) < 0.06);
});
