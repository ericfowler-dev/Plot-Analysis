# Anomaly Detection System - Improvement Recommendations

## Overview

This document covers recommended improvements for `ThresholdContext.jsx` and `anomalyEngine.js` in the PSI engine diagnostics anomaly detection system.

---

## Part 1: ThresholdContext.jsx

### Critical Issues

#### 1. Missing Dependency in useEffect

**Problem:** The `loadInitialData` function is called in a `useEffect` with an empty dependency array, but `loadInitialData` itself depends on `selectedProfileId`, creating a stale closure.

**Current Code:**
```javascript
useEffect(() => {
  loadInitialData();
}, []);
```

**Recommended Fix:**
```javascript
// Option A: Add dependency (but watch for loops)
useEffect(() => {
  loadInitialData();
}, [loadInitialData]);

// Option B (Preferred): Separate concerns
const loadInitialData = useCallback(async () => {
  // ... load profiles, index, selectable - NO profile resolution here
}, []); // Empty deps - only run on mount

// Separate effect for profile changes
useEffect(() => {
  if (selectedProfileId && !loading) {
    getResolvedProfile(selectedProfileId)
      .then(setResolvedProfile)
      .catch(err => console.error(err));
  }
}, [selectedProfileId]);
```

---

#### 2. Race Condition in selectProfile

**Problem:** If a user rapidly switches profiles, stale API responses could overwrite newer selections.

**Current Code:**
```javascript
const selectProfile = useCallback(async (profileId) => {
  if (!profileId || profileId === selectedProfileId) return;
  try {
    setLoading(true);
    const resolved = await getResolvedProfile(profileId);
    setSelectedProfileId(profileId);
    setResolvedProfile(resolved);
    // ...
  }
}, [selectedProfileId]);
```

**Recommended Fix:**
```javascript
// Add a ref to track the latest request
const latestRequestRef = useRef(0);

const selectProfile = useCallback(async (profileId) => {
  if (!profileId || profileId === selectedProfileId) return;

  const requestId = Date.now();
  latestRequestRef.current = requestId;

  try {
    setLoading(true);
    const resolved = await getResolvedProfile(profileId);
    
    // Only apply if this is still the latest request
    if (latestRequestRef.current === requestId) {
      setSelectedProfileId(profileId);
      setResolvedProfile(resolved);
      setError(null);
    }
  } catch (err) {
    if (latestRequestRef.current === requestId) {
      console.error(`Failed to load profile ${profileId}:`, err);
      setError(err.message);
    }
  } finally {
    if (latestRequestRef.current === requestId) {
      setLoading(false);
    }
  }
}, [selectedProfileId]);
```

---

### Structural Improvements

#### 3. Extract Fallback Thresholds to Separate File

**Problem:** `FALLBACK_THRESHOLDS` is ~80 lines of configuration mixed with React component code.

**Recommended Fix:**
```javascript
// lib/defaultThresholds.js
export const FALLBACK_THRESHOLDS = {
  battery: { /* ... */ },
  coolantTemp: { /* ... */ },
  oilPressure: { /* ... */ },
  // ...
};

// ThresholdContext.jsx
import { FALLBACK_THRESHOLDS } from '../lib/defaultThresholds';
```

---

#### 4. Add TypeScript Types or JSDoc for Threshold Paths

**Problem:** The `getThreshold('oilPressure.critical.min')` pattern is error-prone with no type safety.

**Recommended Fix:**
```javascript
/**
 * @typedef {'battery' | 'coolantTemp' | 'oilPressure' | 'rpm' | 'fuelTrim' | 'knock'} ThresholdCategory
 */

/**
 * Get a specific threshold value
 * @param {string} path - Dot-notation path like 'oilPressure.critical.min'
 * @returns {number | object | undefined}
 */
const getThreshold = useCallback((path) => {
  // ...
}, [getThresholds]);
```

---

#### 5. Memoize the Context Value

**Problem:** Currently creates a new object on every render, causing unnecessary re-renders of consumers.

**Current Code:**
```javascript
const value = {
  selectedProfileId,
  resolvedProfile,
  // ... all the rest
};
```

**Recommended Fix:**
```javascript
const value = useMemo(() => ({
  selectedProfileId,
  resolvedProfile,
  profiles,
  selectableProfiles,
  baselineSelection,
  index,
  loading,
  error,
  thresholdSystemEnabled,
  selectProfile,
  refreshProfiles,
  setBaselineSelection,
  setThresholdSystemEnabled,
  getThresholds,
  getAnomalyRules,
  getThreshold,
  FALLBACK_THRESHOLDS
}), [
  selectedProfileId,
  resolvedProfile,
  profiles,
  selectableProfiles,
  baselineSelection,
  index,
  loading,
  error,
  thresholdSystemEnabled,
  selectProfile,
  refreshProfiles,
  getThresholds,
  getAnomalyRules,
  getThreshold
]);
```

---

### Feature Additions

#### 6. Profile Validation on Load

**Problem:** Complex threshold structures (pressure maps, persistence timers) could have invalid data.

**Recommended Addition:**
```javascript
const validateProfile = (profile) => {
  const errors = [];
  
  if (profile.thresholds?.oilPressure?.pressureMap) {
    const map = profile.thresholds.oilPressure.pressureMap;
    // Ensure sorted by RPM
    for (let i = 1; i < map.length; i++) {
      if (map[i].rpm <= map[i-1].rpm) {
        errors.push('pressureMap must be sorted by ascending RPM');
      }
    }
  }
  
  // Validate threshold relationships
  const oil = profile.thresholds?.oilPressure;
  if (oil?.warning?.min && oil?.critical?.min) {
    if (oil.warning.min <= oil.critical.min) {
      errors.push('Oil pressure warning threshold must be greater than critical');
    }
  }
  
  return errors;
};
```

---

#### 7. Persist Selection to localStorage

**Recommended Addition:**
```javascript
const [selectedProfileId, setSelectedProfileId] = useState(() => {
  return localStorage.getItem('selectedThresholdProfile') || 'global-defaults';
});

// In selectProfile, after successful load:
localStorage.setItem('selectedThresholdProfile', profileId);
```

---

## Part 2: anomalyEngine.js

### Critical Issues

#### 1. Memory Leak in RuleTimingTracker.checkPersistence

**Problem:** The `windowHistory` array grows unbounded if `windowSec` is set but data stops flowing.

**Current Code:**
```javascript
state.windowHistory.push({ time, met: conditionMet });
const windowStart = time - rule.windowSec;
state.windowHistory = state.windowHistory.filter(h => h.time >= windowStart);
```

**Recommended Fix:**
```javascript
const MAX_WINDOW_ENTRIES = 1000;

state.windowHistory.push({ time, met: conditionMet });
const windowStart = time - rule.windowSec;
state.windowHistory = state.windowHistory.filter(h => h.time >= windowStart);

// Guard against unbounded growth
if (state.windowHistory.length > MAX_WINDOW_ENTRIES) {
  state.windowHistory = state.windowHistory.slice(-MAX_WINDOW_ENTRIES);
}
```

---

#### 2. Deprecated Code Still Being Instantiated

**Problem:** `OilPressureAlertTracker` is created but its `check()` method is marked deprecated and never used. `calculateMinOilPressure` is also marked deprecated.

**Current Code:**
```javascript
// Line ~960: Creates tracker that's never meaningfully used
const oilPressureAlertTracker = new OilPressureAlertTracker({...});

// Line ~1050: checkOilPressure() doesn't use the tracker's check() method
// It does simple threshold comparison instead
```

**Recommended Fix:** Either:
- **Option A:** Remove `OilPressureAlertTracker` and `calculateMinOilPressure` entirely
- **Option B:** Add clear documentation explaining why they're kept (future use, backwards compatibility, etc.)

```javascript
/**
 * @deprecated Kept for backwards compatibility with pre-v2.0 configs.
 * New implementations should use static thresholds from user config.
 * Will be removed in v3.0.
 */
class OilPressureAlertTracker { /* ... */ }
```

---

#### 3. Loose Equality in Condition Evaluation

**Problem:** Using `==` and `!=` can cause unexpected type coercion bugs.

**Current Code:**
```javascript
case '==': return value == condition.value;
case '!=': return value != condition.value;
```

**Recommended Fix:**
```javascript
case '==': 
  return value === condition.value || 
         (typeof value === 'number' && typeof condition.value === 'number' && value === condition.value) ||
         Number(value) === Number(condition.value);
case '!=': 
  return value !== condition.value && 
         Number(value) !== Number(condition.value);
```

Or simpler, with explicit number handling:
```javascript
function compareValues(a, b, operator) {
  // Normalize to numbers if both can be parsed as numbers
  const numA = typeof a === 'number' ? a : parseFloat(a);
  const numB = typeof b === 'number' ? b : parseFloat(b);
  
  const useNumbers = !isNaN(numA) && !isNaN(numB);
  const left = useNumbers ? numA : a;
  const right = useNumbers ? numB : b;
  
  switch (operator) {
    case '==': return left === right;
    case '!=': return left !== right;
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    default: return false;
  }
}
```

---

#### 4. Oil Pressure Default Thresholds - UPDATE REQUIRED

**Problem:** Hardcoded fallback values don't match desired thresholds.

**Current Code (line ~1062):**
```javascript
const warningThreshold = userWarningMin !== undefined ? userWarningMin : 20;
const criticalThreshold = userCriticalMin !== undefined ? userCriticalMin : 10;
```

**Required Fix:**
```javascript
const warningThreshold = userWarningMin !== undefined ? userWarningMin : 8;
const criticalThreshold = userCriticalMin !== undefined ? userCriticalMin : 6;
```

**Also update in FALLBACK_THRESHOLDS (ThresholdContext.jsx):**
```javascript
oilPressure: {
  critical: { min: 6 },   // was 10
  warning: { min: 8 },    // was 20
  // ...
}
```

---

### Performance Improvements

#### 5. Column Map Created on Every Call

**Problem:** `createColumnMap()` is called fresh for every `detectAnomalies()` invocation, even if analyzing the same dataset structure repeatedly.

**Current Code:**
```javascript
const columnMap = createColumnMap(data, thresholds);
```

**Recommended Fix:**
```javascript
export function detectAnomalies(data, thresholds, options = {}) {
  const {
    columnMap: providedColumnMap,
    // ... other options
  } = options;
  
  const columnMap = providedColumnMap || createColumnMap(data, thresholds);
  // ...
}

// Usage for repeated calls on same structure:
const columnMap = createColumnMap(data, thresholds);
for (const batch of batches) {
  detectAnomalies(batch, thresholds, { columnMap });
}
```

---

#### 6. Alert Lookup is O(n) on Every Update

**Problem:** Every alert state update does a linear search through all alerts.

**Current Code:**
```javascript
const existingAlert = alerts.find(a => a.id === alertId && !a.endTime);
```

**Recommended Fix:**
```javascript
// Maintain an index of active alerts
const activeAlerts = new Map(); // alertId -> alert object

function handleAlertState(alertId, isActive, time, value, alerts, activeAlerts, values, config) {
  if (isActive) {
    if (!activeAlerts.has(alertId)) {
      const newAlert = {
        id: alertId,
        name: config.name,
        // ... rest of alert properties
      };
      alerts.push(newAlert);
      activeAlerts.set(alertId, newAlert);
      values.set(alertId, { min: value, max: value, sum: value, count: 1 });
    } else {
      // Update existing - O(1) lookup
      const existingAlert = activeAlerts.get(alertId);
      const stats = values.get(alertId);
      // ... update logic
    }
  } else {
    if (activeAlerts.has(alertId)) {
      const existingAlert = activeAlerts.get(alertId);
      existingAlert.endTime = time;
      existingAlert.duration = time - existingAlert.startTime;
      activeAlerts.delete(alertId);
      values.delete(alertId);
    }
  }
}
```

---

#### 7. Debug Trace Allocation Optimization

**Problem:** Object literals are constructed before the `if (debugTrace)` check.

**Current Code:**
```javascript
if (debugTrace) {
  const base = {
    idx: i,
    time,
    engineState: engineState.state,
    // ... many properties
  };
  debugTrace.push(base);
}
```

**Note:** This is actually fine - the object is only created inside the `if` block. No change needed. However, for additional params:

```javascript
if (debugTrace) {
  const entry = {
    idx: i,
    time,
    engineState: engineState.state,
    rpm,
    vsw: row.Vsw ?? row.vsw ?? row.VSW
  };
  
  // Only add optional params if requested
  if (debugParams.length > 0) {
    for (const key of debugParams) {
      entry[key] = row[key] ?? getParamValue(row, key, columnMap);
    }
  }
  
  debugTrace.push(entry);
}
```

---

### API Design Suggestions

#### 8. Consider a Builder Pattern for Complex Configuration

**Problem:** Threshold config is deeply nested and hard to construct programmatically.

**Recommended Addition:**
```javascript
class AnomalyDetectorBuilder {
  constructor() {
    this.config = {
      thresholds: {},
      anomalyRules: [],
      options: {}
    };
  }
  
  withOilPressure({ warning, critical, rpmDependent = true }) {
    this.config.thresholds.oilPressure = {
      warning: { min: warning },
      critical: { min: critical },
      rpmDependent
    };
    return this;
  }
  
  withCoolantTemp({ warning, critical, gracePeriod = 60 }) {
    this.config.thresholds.coolantTemp = {
      warning: { max: warning },
      critical: { max: critical },
      gracePeriod
    };
    return this;
  }
  
  withSignalQuality({ enabled = true, channels = [] }) {
    this.config.thresholds.signalQuality = {
      enabled,
      channels: channels.reduce((acc, ch) => {
        acc[ch] = { enabled: true };
        return acc;
      }, {})
    };
    return this;
  }
  
  addRule(rule) {
    this.config.anomalyRules.push(rule);
    return this;
  }
  
  build() {
    return this.config;
  }
}

// Usage:
const config = new AnomalyDetectorBuilder()
  .withOilPressure({ warning: 8, critical: 6 })
  .withCoolantTemp({ warning: 220, critical: 235 })
  .withSignalQuality({ enabled: true, channels: ['OILP_press', 'ECT'] })
  .build();
```

---

#### 9. Add TypeScript Types or JSDoc for Rule Schema

**Problem:** Anomaly rules have complex shapes that aren't documented.

**Recommended Addition:**
```javascript
/**
 * @typedef {Object} RuleCondition
 * @property {string} param - Parameter name or engine state predicate
 * @property {'>' | '<' | '>=' | '<=' | '==' | '!='} operator - Comparison operator
 * @property {number | boolean} value - Value to compare against
 */

/**
 * @typedef {Object} AnomalyRule
 * @property {string} id - Unique rule identifier
 * @property {string} name - Display name
 * @property {string} [description] - Optional description
 * @property {boolean} enabled - Whether rule is active
 * @property {Array<RuleCondition>} conditions - Conditions to evaluate
 * @property {'AND' | 'OR'} [logic='AND'] - How to combine conditions
 * @property {'critical' | 'warning' | 'info'} [severity='warning'] - Alert severity
 * @property {string} [category='custom'] - Alert category
 * @property {number} [triggerPersistenceSec] - Seconds condition must be true before triggering
 * @property {number} [clearPersistenceSec] - Seconds condition must be false before clearing
 * @property {number} [startDelaySec] - Skip evaluation for X seconds after engine start
 * @property {number} [stopDelaySec] - Skip evaluation for X seconds after engine stop
 * @property {number} [windowSec] - Rolling time window for evaluation
 * @property {Array<RuleCondition>} [requireWhen] - Prerequisites (all must be true)
 * @property {Array<RuleCondition>} [ignoreWhen] - Skip conditions (any true = skip rule)
 */

/**
 * Main anomaly detection function
 * @param {Array<Object>} data - Array of data rows with parameter values
 * @param {Object} thresholds - Resolved threshold profile
 * @param {Object} [options] - Detection options
 * @param {number} [options.gracePeriod=5] - Seconds to ignore at start
 * @param {number} [options.sampleRate=1] - Samples per second
 * @param {number} [options.minDuration=0] - Minimum alert duration
 * @param {boolean} [options.debug=false] - Enable debug traces
 * @param {Array<string>} [options.debugParams=[]] - Additional params for debug
 * @returns {{alerts: Array, statistics: Object, events: Array, debugTrace: Array|null}}
 */
export function detectAnomalies(data, thresholds, options = {}) {
  // ...
}
```

---

### Minor Issues

#### 10. Inconsistent Null Checks

**Problem:** Mix of `??` and `||` operators, where `||` treats `0` as falsy.

**Current Code:**
```javascript
// Some places use ??
const vsw = row?.Vsw ?? row?.vsw ?? row?.VSW ?? 0;

// Others use ||
const rpm = getParamValue(row, 'rpm', columnMap) || 0;
```

**Recommended Fix:** Use `??` consistently for numeric values:
```javascript
const rpm = getParamValue(row, 'rpm', columnMap) ?? 0;
```

---

#### 11. Magic Numbers Scattered Throughout

**Problem:** Hard-coded values make maintenance difficult.

**Recommended Fix:** Create a constants section:
```javascript
// Constants - Detection Defaults
const DEFAULTS = {
  GRACE_PERIOD_SEC: 5,
  WARMUP_GRACE_SEC: 60,
  SAMPLE_RATE: 1,
  
  // Engine State
  RPM_CRANKING: 100,
  RPM_RUNNING: 500,
  RPM_STABLE: 800,
  
  // Oil Pressure
  OIL_PRESSURE_WARNING_MIN: 8,
  OIL_PRESSURE_CRITICAL_MIN: 6,
  OIL_PRESSURE_FILTER_WINDOW_MS: 500,
  
  // Timing
  START_HOLDOFF_SEC: 3,
  STABLE_HOLDOFF_SEC: 2,
  STOP_HOLDOFF_SEC: 2,
  SHUTDOWN_RPM_RATE: -300,
  
  // Persistence
  WARN_PERSIST_SEC: 1.5,
  CRITICAL_PERSIST_SEC: 0.5,
  CLEAR_PERSIST_SEC: 1.0,
  HYSTERESIS_PSI: 3,
  
  // Limits
  MAX_WINDOW_ENTRIES: 1000,
  RPM_HISTORY_SIZE: 10
};

// Then use throughout:
this.rpmCrankingThreshold = config.rpmCrankingThreshold ?? DEFAULTS.RPM_CRANKING;
```

---

## Summary: Priority Order

### Must Fix (Breaking/Data Issues)
1. **Oil pressure defaults:** Change to 6 critical, 8 warning
2. **Race condition in selectProfile:** Add request tracking
3. **Memory leak in windowHistory:** Add max size guard

### Should Fix (Quality/Maintainability)
4. **Remove deprecated classes:** Clean up `OilPressureAlertTracker` and `calculateMinOilPressure`
5. **Memoize context value:** Prevent unnecessary re-renders
6. **Strict equality operators:** Prevent type coercion bugs
7. **Extract constants:** Replace magic numbers

### Nice to Have (Performance/DX)
8. **O(1) alert lookups:** Use Map for active alerts
9. **Column map caching:** Pass through options
10. **JSDoc types:** Document complex schemas
11. **Profile validation:** Catch config errors early
12. **localStorage persistence:** Remember profile selection

---

## Quick Reference: Oil Pressure Values

| Setting | Old Value | New Value |
|---------|-----------|-----------|
| `FALLBACK_THRESHOLDS.oilPressure.critical.min` | 10 | **6** |
| `FALLBACK_THRESHOLDS.oilPressure.warning.min` | 20 | **8** |
| `checkOilPressure()` fallback warning | 20 | **8** |
| `checkOilPressure()` fallback critical | 10 | **6** |

### Files to Update
- `ThresholdContext.jsx` - Line ~35 (FALLBACK_THRESHOLDS)
- `anomalyEngine.js` - Line ~1062 (checkOilPressure fallbacks)
