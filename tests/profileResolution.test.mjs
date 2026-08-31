import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadIndex,
  resolveProfileFromDimensions
} from '../server/utils/profileLoader.js';

test('40L with the default MFG variant resolves the MFG profile', async () => {
  const index = await loadIndex(true);
  const engine = index.engineSizes.find(entry => entry.id === '40L');

  assert.deepEqual(engine.defaultVariants, ['mfg']);

  const result = await resolveProfileFromDimensions(
    'psi-hd',
    '40L',
    '*',
    '*',
    engine.defaultVariants
  );

  assert.equal(result.profileId, 'psi-hd-40l-53l-mfg');
  assert.equal(result.matchLevel, 'exact');
  assert.equal(result.fallback, false);
});
