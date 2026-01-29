/**
 * Shared engine state tracking utilities.
 */

export const ENGINE_STATE = {
  OFF: 'off',
  CRANKING: 'cranking',
  RUNNING_UNSTABLE: 'running_unstable',
  RUNNING_STABLE: 'running_stable',
  STOPPING: 'stopping'
};

const DEFAULT_ENGINE_STATE_CONFIG = {
  rpmCrankingThreshold: 100,
  rpmRunningThreshold: 650,
  rpmStableThreshold: 800,
  startHoldoffSeconds: 3,
  stableHoldoffSeconds: 2,
  stopHoldoffSeconds: 2,
  shutdownRpmRate: -300,
  historyWindowSize: 10
};

function toNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildEngineStateConfig(config = {}) {
  const rpmRunningFallback = config.rpmRunningThreshold ?? DEFAULT_ENGINE_STATE_CONFIG.rpmRunningThreshold;

  return {
    rpmCrankingThreshold: config.rpmCrankingThreshold ?? DEFAULT_ENGINE_STATE_CONFIG.rpmCrankingThreshold,
    rpmRunningThreshold: rpmRunningFallback,
    rpmStableThreshold: config.rpmStableThreshold ?? rpmRunningFallback ?? DEFAULT_ENGINE_STATE_CONFIG.rpmStableThreshold,
    startHoldoffSeconds: config.startHoldoffSeconds ?? config.startupGraceSeconds ?? DEFAULT_ENGINE_STATE_CONFIG.startHoldoffSeconds,
    stableHoldoffSeconds: config.stableHoldoffSeconds ?? DEFAULT_ENGINE_STATE_CONFIG.stableHoldoffSeconds,
    stopHoldoffSeconds: config.stopHoldoffSeconds ?? DEFAULT_ENGINE_STATE_CONFIG.stopHoldoffSeconds,
    shutdownRpmRate: config.shutdownRpmRate ?? DEFAULT_ENGINE_STATE_CONFIG.shutdownRpmRate,
    historyWindowSize: config.historyWindowSize ?? config.rpmHistorySize ?? DEFAULT_ENGINE_STATE_CONFIG.historyWindowSize
  };
}

/**
 * Engine state tracker for detecting startup/shutdown transitions.
 */
export class EngineStateTracker {
  constructor(config = {}) {
    const resolved = buildEngineStateConfig(config);

    this.rpmCrankingThreshold = resolved.rpmCrankingThreshold;
    this.rpmRunningThreshold = resolved.rpmRunningThreshold;
    this.rpmStableThreshold = resolved.rpmStableThreshold;
    this.startHoldoffSeconds = resolved.startHoldoffSeconds;
    this.stableHoldoffSeconds = resolved.stableHoldoffSeconds;
    this.stopHoldoffSeconds = resolved.stopHoldoffSeconds;
    this.shutdownRpmRate = resolved.shutdownRpmRate;
    this.historyWindowSize = resolved.historyWindowSize;

    this.state = ENGINE_STATE.OFF;
    this.stateStartTime = 0;
    this.lastRpm = 0;
    this.lastTime = 0;
    this.rpmHistory = [];
    this.timeAboveRunning = 0;
    this.timeAboveStable = 0;
    this.lastAboveRunningTime = null;
    this.lastAboveStableTime = null;
  }

  update(rpm, time) {
    this.rpmHistory.push({ rpm, time });
    if (this.rpmHistory.length > this.historyWindowSize) {
      this.rpmHistory.shift();
    }

    const rpmRate = this.calculateRpmRate();
    const smoothedRpm = this.getSmoothedRpm();

    const prevState = this.state;

    if (smoothedRpm >= this.rpmRunningThreshold) {
      if (this.lastAboveRunningTime === null) {
        this.lastAboveRunningTime = time;
      }
      this.timeAboveRunning = time - this.lastAboveRunningTime;
    } else {
      this.lastAboveRunningTime = null;
      this.timeAboveRunning = 0;
    }

    if (smoothedRpm >= this.rpmStableThreshold) {
      if (this.lastAboveStableTime === null) {
        this.lastAboveStableTime = time;
      }
      this.timeAboveStable = time - this.lastAboveStableTime;
    } else {
      this.lastAboveStableTime = null;
      this.timeAboveStable = 0;
    }

    switch (this.state) {
      case ENGINE_STATE.OFF:
        if (smoothedRpm >= this.rpmCrankingThreshold) {
          this.state = ENGINE_STATE.CRANKING;
          this.stateStartTime = time;
        }
        break;

      case ENGINE_STATE.CRANKING:
        if (smoothedRpm < this.rpmCrankingThreshold) {
          this.state = ENGINE_STATE.OFF;
          this.stateStartTime = time;
        } else if (this.timeAboveRunning >= this.startHoldoffSeconds) {
          this.state = ENGINE_STATE.RUNNING_UNSTABLE;
          this.stateStartTime = time;
        }
        break;

      case ENGINE_STATE.RUNNING_UNSTABLE:
        if (smoothedRpm < this.rpmCrankingThreshold) {
          this.state = ENGINE_STATE.OFF;
          this.stateStartTime = time;
        } else if (smoothedRpm < this.rpmRunningThreshold) {
          this.state = ENGINE_STATE.STOPPING;
          this.stateStartTime = time;
        } else if (rpmRate < this.shutdownRpmRate) {
          this.state = ENGINE_STATE.STOPPING;
          this.stateStartTime = time;
        } else if (this.timeAboveStable >= this.stableHoldoffSeconds) {
          this.state = ENGINE_STATE.RUNNING_STABLE;
          this.stateStartTime = time;
        }
        break;

      case ENGINE_STATE.RUNNING_STABLE:
        if (smoothedRpm < this.rpmCrankingThreshold) {
          this.state = ENGINE_STATE.OFF;
          this.stateStartTime = time;
        } else if (smoothedRpm < this.rpmRunningThreshold) {
          this.state = ENGINE_STATE.STOPPING;
          this.stateStartTime = time;
        } else if (rpmRate < this.shutdownRpmRate) {
          this.state = ENGINE_STATE.STOPPING;
          this.stateStartTime = time;
        }
        break;

      case ENGINE_STATE.STOPPING:
        if (smoothedRpm < this.rpmCrankingThreshold) {
          const timeInState = time - this.stateStartTime;
          if (timeInState >= this.stopHoldoffSeconds || smoothedRpm < 50) {
            this.state = ENGINE_STATE.OFF;
            this.stateStartTime = time;
          }
        } else if (smoothedRpm >= this.rpmRunningThreshold && rpmRate >= 0) {
          this.state = ENGINE_STATE.RUNNING_UNSTABLE;
          this.stateStartTime = time;
        }
        break;
    }

    this.lastRpm = rpm;
    this.lastTime = time;

    return {
      state: this.state,
      prevState,
      timeInState: time - this.stateStartTime,
      rpmRate,
      smoothedRpm,
      timeAboveRunning: this.timeAboveRunning,
      timeAboveStable: this.timeAboveStable,
      stateChanged: prevState !== this.state
    };
  }

  calculateRpmRate() {
    if (this.rpmHistory.length < 2) return 0;

    const oldest = this.rpmHistory[0];
    const newest = this.rpmHistory[this.rpmHistory.length - 1];
    const timeDiff = newest.time - oldest.time;

    if (timeDiff <= 0) return 0;

    return (newest.rpm - oldest.rpm) / timeDiff;
  }

  getSmoothedRpm() {
    if (this.rpmHistory.length === 0) return 0;
    const sum = this.rpmHistory.reduce((acc, h) => acc + h.rpm, 0);
    return sum / this.rpmHistory.length;
  }

  shouldCheckOilPressure() {
    return this.state === ENGINE_STATE.RUNNING_STABLE;
  }

  shouldSuppressWarnings() {
    return this.state === ENGINE_STATE.OFF ||
           this.state === ENGINE_STATE.CRANKING ||
           this.state === ENGINE_STATE.STOPPING;
  }

  getStateName() {
    const names = {
      [ENGINE_STATE.OFF]: 'Off',
      [ENGINE_STATE.CRANKING]: 'Cranking',
      [ENGINE_STATE.RUNNING_UNSTABLE]: 'Running (Stabilizing)',
      [ENGINE_STATE.RUNNING_STABLE]: 'Running (Stable)',
      [ENGINE_STATE.STOPPING]: 'Stopping'
    };
    return names[this.state] || this.state;
  }

  reset() {
    this.state = ENGINE_STATE.OFF;
    this.stateStartTime = 0;
    this.lastRpm = 0;
    this.lastTime = 0;
    this.rpmHistory = [];
    this.timeAboveRunning = 0;
    this.timeAboveStable = 0;
    this.lastAboveRunningTime = null;
    this.lastAboveStableTime = null;
  }
}

/**
 * Generate engine states for each row using the shared tracker.
 */
export function generateEngineStates(data, config = {}) {
  const tracker = new EngineStateTracker(config);
  const states = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rpmValue = toNumber(row?.rpm ?? row?.RPM);
    const timeValue = toNumber(row?.Time);
    const time = timeValue ?? i / 10;
    const rpm = rpmValue ?? 0;
    const state = tracker.update(rpm, time);
    states.push(state.state);
  }

  return states;
}
