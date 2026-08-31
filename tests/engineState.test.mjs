import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_STATE, EngineStateTracker } from '../src/lib/engineState.js';

test('stable running exits to unstable after RPM remains below the stable band', () => {
  const tracker = new EngineStateTracker({
    rpmCrankingThreshold: 100,
    rpmRunningThreshold: 500,
    rpmStableThreshold: 800,
    rpmStableHysteresis: 50,
    startHoldoffSeconds: 0,
    stableHoldoffSeconds: 0,
    stableExitHoldoffSeconds: 1,
    historyWindowSize: 1
  });

  tracker.update(900, 0);
  tracker.update(900, 1);
  assert.equal(tracker.update(900, 2).state, ENGINE_STATE.RUNNING_STABLE);
  assert.equal(tracker.update(700, 3).state, ENGINE_STATE.RUNNING_STABLE);
  assert.equal(tracker.update(700, 4.1).state, ENGINE_STATE.RUNNING_UNSTABLE);
});
