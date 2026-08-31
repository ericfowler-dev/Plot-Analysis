import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareConfigVersions,
  mergeVersionedIndex,
  mergeVersionedProfile
} from '../server/utils/versionedConfig.js';

test('semantic config versions compare numerically', () => {
  assert.ok(compareConfigVersions('1.0.16', '1.0.15') > 0);
  assert.ok(compareConfigVersions('2.0.0', '1.12.9') > 0);
  assert.equal(compareConfigVersions('1.0', '1.0.0'), 0);
});

test('newer bundled index restores MFG resolution data and preserves custom entries', () => {
  const stored = {
    version: '1.0.0',
    profiles: ['custom-profile'],
    engineSizes: [{ id: '40L', family: 'psi-hd', archived: true }, { id: 'custom', family: 'custom' }]
  };
  const bundled = {
    version: '2.0.0',
    profiles: ['psi-hd-40l-53l-mfg'],
    engineSizes: [{ id: '40L', family: 'psi-hd', defaultVariants: ['mfg'], variantConfigs: { mfg: { profileId: 'psi-hd-40l-53l-mfg' } } }],
    profileMatrix: [{ family: 'psi-hd', size: ['40L', '53L'], variants: ['mfg'], profileId: 'psi-hd-40l-53l-mfg' }]
  };

  const merged = mergeVersionedIndex(stored, bundled);
  const engine = merged.engineSizes.find(entry => entry.id === '40L');
  assert.deepEqual(engine.defaultVariants, ['mfg']);
  assert.equal(engine.archived, true);
  assert.equal(merged.profileMatrix[0].profileId, 'psi-hd-40l-53l-mfg');
  assert.deepEqual(merged.profiles, ['psi-hd-40l-53l-mfg', 'custom-profile']);
  assert.ok(merged.engineSizes.some(entry => entry.id === 'custom'));
});

test('newer bundled profile corrects rules while retaining advanced database settings', () => {
  const stored = {
    version: '1.0.15',
    anomalyRules: [{
      id: 'mfg-low-delta-pressure',
      conditions: [{ param: 'MFG_DPPress', operator: '<', value: 0.5 }],
      requireWhen: [{ param: 'EngineStable', operator: '>=', value: 800 }],
      ignoreWhen: [{ param: 'EngineStarting', operator: '>=', value: 1 }],
      triggerPersistenceSec: 3
    }]
  };
  const bundled = {
    version: '1.0.16',
    anomalyRules: [{
      id: 'mfg-low-delta-pressure',
      conditions: [
        { param: 'MFG_DPPress', operator: '<', value: 0.6 },
        { param: 'MFG_DPPress', operator: '>=', value: 0.4 }
      ],
      requireWhen: [{ param: 'EngineStable', operator: '==', value: 1 }]
    }]
  };

  const merged = mergeVersionedProfile(stored, bundled);
  assert.equal(merged.version, '1.0.16');
  assert.deepEqual(merged.anomalyRules[0].requireWhen, [
    { param: 'EngineStable', operator: '==', value: 1 }
  ]);
  assert.equal(merged.anomalyRules[0].conditions[0].value, 0.6);
  assert.equal(merged.anomalyRules[0].triggerPersistenceSec, 3);
  assert.equal(merged.anomalyRules[0].ignoreWhen[0].param, 'EngineStarting');
});

test('equal database version remains authoritative for configurator edits', () => {
  const stored = { version: '2.0.0', description: 'edited in configurator' };
  const bundled = { version: '2.0.0', description: 'bundled' };
  assert.equal(mergeVersionedProfile(stored, bundled).description, 'edited in configurator');
});
