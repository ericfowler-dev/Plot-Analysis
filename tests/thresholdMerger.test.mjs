import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  mergeProfileObjectField,
  validateAnomalyRules,
  validateThresholdValues
} from '../server/utils/thresholdMerger.js';

test('runtime profile objects merge through inheritance', () => {
  const hierarchy = [
    { validityConfig: { defaults: { rpmRunningThreshold: 500, vswThreshold: 1 } } },
    { validityConfig: { defaults: { rpmRunningThreshold: 600 }, channelPolicies: { rpm: { excludeZero: true } } } }
  ];

  assert.deepEqual(mergeProfileObjectField(hierarchy, 'validityConfig'), {
    defaults: { rpmRunningThreshold: 600, vswThreshold: 1 },
    channelPolicies: { rpm: { excludeZero: true } }
  });
});

test('rule validation rejects numeric misuse of engine-state predicates', () => {
  const result = validateAnomalyRules([{
    id: 'bad-stable-rule',
    name: 'Bad stable rule',
    enabled: true,
    conditions: [{ param: 'EngineStable', operator: '>=', value: 800 }]
  }]);

  assert.equal(result.isValid, false);
  assert.ok(result.errors.some(error => error.includes('must use == or !=')));
  assert.ok(result.errors.some(error => error.includes('value must be 0, 1')));
});

test('all committed profile JSON parses and validates', () => {
  const directory = path.resolve('server/data/profiles');
  const files = fs.readdirSync(directory).filter(file => file.endsWith('.json'));

  for (const file of files) {
    const profile = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
    if (file === '_index.json') continue;
    assert.equal(validateThresholdValues(profile.thresholds || {}).isValid, true, file);
    assert.equal(validateAnomalyRules(profile.anomalyRules || []).isValid, true, file);
  }
});
