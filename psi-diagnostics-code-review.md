# PSI Engine Diagnostics System - Comprehensive Code Review

## Executive Summary

This document covers a detailed code review of the PSI engine diagnostics anomaly detection system, spanning 13 JavaScript modules. The codebase is well-architected with good separation of concerns, but has opportunities for consolidation, consistency improvements, and bug fixes.

**Key Findings:**
- 3 Critical bugs requiring immediate attention
- 5 Architectural issues causing code duplication
- 12 Consistency issues across modules
- 8 Performance optimization opportunities

---

## Table of Contents

1. [Critical Bug Fixes](#1-critical-bug-fixes)
2. [Architectural Issues](#2-architectural-issues)
3. [File-Specific Recommendations](#3-file-specific-recommendations)
4. [Cross-Cutting Concerns](#4-cross-cutting-concerns)
5. [Oil Pressure Threshold Updates](#5-oil-pressure-threshold-updates)
6. [Implementation Priority](#6-implementation-priority)

---

## 1. Critical Bug Fixes

### 1.1 Oil Pressure Default Thresholds - INCORRECT VALUES

**Severity:** HIGH - Affects alert accuracy

**Problem:** Oil pressure thresholds are inconsistent and incorrect across files.

**Required Changes:**

| File | Location | Current | Required |
|------|----------|---------|----------|
| `ThresholdContext.jsx` | FALLBACK_THRESHOLDS.oilPressure | critical: 10, warning: 20 | critical: 6, warning: 8 |
| `anomalyEngine.js` | checkOilPressure() fallbacks | critical: 10, warning: 20 | critical: 6, warning: 8 |
| `bplotThresholds.js` | BPLOT_THRESHOLDS.oilPressure | critical_low: 10, warning_low: 20 | critical_low: 6, warning_low: 8 |
| `thresholds.js` (ECM) | ECM_THRESHOLDS.oilPressure | criticalLow: 15, warningLow: 25 | criticalLow: 6, warningLow: 8 |

---

### 1.2 Race Condition in ThresholdContext.selectProfile

**Severity:** HIGH - Can cause UI state corruption

**Problem:** Rapid profile switching can result in stale API responses overwriting newer selections.

**Current Code:**
```javascript
const selectProfile = useCallback(async (profileId) => {
  if (!profileId || profileId === selectedProfileId) return;
  try {
    setLoading(true);
    const resolved = await getResolvedProfile(profileId);
    setSelectedProfileId(profileId);  // May be stale!
    setResolvedProfile(resolved);
  }
  // ...
}, [selectedProfileId]);
```

**Fix:**
```javascript
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

### 1.3 Memory Leak in RuleTimingTracker.checkPersistence

**Severity:** MEDIUM - Causes memory growth over long sessions

**Problem:** `windowHistory` array grows unbounded if `windowSec` is set.

**Location:** `anomalyEngine.js` ~line 550

**Fix:**
```javascript
const MAX_WINDOW_ENTRIES = 1000;

// After filtering by time window:
state.windowHistory = state.windowHistory.filter(h => h.time >= windowStart);

// Add size guard:
if (state.windowHistory.length > MAX_WINDOW_ENTRIES) {
  state.windowHistory = state.windowHistory.slice(-MAX_WINDOW_ENTRIES);
}
```

---

## 2. Architectural Issues

### 2.1 Duplicated Engine State Machine (3 locations)

**Problem:** Engine state tracking logic exists in three places with slight variations:

| File | Implementation | Purpose |
|------|---------------|---------|
| `anomalyEngine.js` | `EngineStateTracker` class | Full implementation with history |
| `bplotParsers.js` | `generateEngineStates()` | Simplified copy |
| `ThresholdContext.jsx` | References ENGINE_STATE constants | Just constants |

**Impact:** 
- Bug fixes must be applied in multiple places
- Different threshold values between implementations
- Maintenance burden

**Recommendation:** Extract to shared module:

```javascript
// lib/engineState.js
export const ENGINE_STATE = {
  OFF: 'off',
  CRANKING: 'cranking',
  RUNNING_UNSTABLE: 'running_unstable',
  RUNNING_STABLE: 'running_stable',
  STOPPING: 'stopping'
};

export const ENGINE_STATE_DEFAULTS = {
  RPM_CRANKING_THRESHOLD: 100,
  RPM_RUNNING_THRESHOLD: 500,
  RPM_STABLE_THRESHOLD: 800,
  START_HOLDOFF_SEC: 3,
  STABLE_HOLDOFF_SEC: 2,
  STOP_HOLDOFF_SEC: 2,
  SHUTDOWN_RPM_RATE: -300
};

export class EngineStateTracker { /* ... full implementation ... */ }

// Simplified version for bulk processing
export function generateEngineStates(data, config = ENGINE_STATE_DEFAULTS) { /* ... */ }
```

---

### 2.2 Duplicated Variable/Parameter Definitions (3 locations)

**Problem:** Parameter metadata duplicated across:

| File | Object | Count |
|------|--------|-------|
| `variableDefinitions.js` | `VARIABLE_DEFINITIONS` | ~120 entries |
| `bplotThresholds.js` | `BPLOT_PARAMETERS` | ~150 entries |
| `thresholds.js` | `ECM_PARAMETERS` | ~20 entries |

**Impact:**
- Inconsistent units/descriptions
- Some parameters defined differently in each file
- Example: `OILP_press` category is 'thermal' in one, 'pressure' in another

**Recommendation:** Create canonical source:

```javascript
// lib/parameterDefinitions.js
export const PARAMETER_DEFINITIONS = {
  // Canonical definitions with all metadata
  OILP_press: {
    name: 'Oil Pressure',
    unit: 'psi',
    description: 'Engine oil pressure',
    category: 'pressure',  // Single source of truth
    validityPolicy: 'ValidWhenEngineStable',
    thresholds: { critical: { min: 6 }, warning: { min: 8 } }
  },
  // ...
};

// Generate other formats from canonical source
export const BPLOT_PARAMETERS = Object.fromEntries(
  Object.entries(PARAMETER_DEFINITIONS).map(([k, v]) => [k, {
    name: v.name,
    unit: v.unit,
    description: v.description,
    category: v.category
  }])
);
```

---

### 2.3 Inconsistent Threshold Sources

**Problem:** Threshold values come from multiple sources with different structures:

| Source | Structure | Used By |
|--------|-----------|---------|
| `FALLBACK_THRESHOLDS` | `{ critical: { min: X } }` | ThresholdContext |
| `BPLOT_THRESHOLDS` | `{ critical_low: X }` | bplotProcessData |
| `ECM_THRESHOLDS` | `{ criticalLow: X }` | processData |
| Profile JSON | `{ thresholds: { oilPressure: { critical: { min: X } } } }` | API |

**Recommendation:** Standardize on profile JSON structure everywhere:
```javascript
{
  critical: { min: X, max: Y },
  warning: { min: X, max: Y },
  hysteresis: { lowClear: X, highClear: Y }
}
```

---

### 2.4 Channel Aliasing in Multiple Places

**Problem:** Channel name normalization happens in:
- `bplotParsers.js` - `CHANNEL_ALIASES` (extensive)
- `faultSnapshotMapping.js` - `SNAPSHOT_TO_BPLOT_MAP` (partial)
- `anomalyEngine.js` - `DEFAULT_PARAM_MAPPINGS` (different subset)

**Recommendation:** Single canonical alias map:
```javascript
// lib/channelAliases.js
export const CHANNEL_ALIASES = {
  // All aliases -> canonical name
  'rpm': 'rpm',
  'RPM': 'rpm',
  'engine_speed': 'rpm',
  'ENGINE_SPEED': 'rpm',
  // ... complete list
};

export function normalizeChannelName(name) {
  return CHANNEL_ALIASES[name] || CHANNEL_ALIASES[name.toLowerCase()] || name;
}

export function getCanonicalName(anyVariant) {
  return normalizeChannelName(anyVariant);
}
```

---

### 2.5 Deprecated Code Still Instantiated

**Problem:** `anomalyEngine.js` creates objects that are never used:

```javascript
// Line ~960 - created but check() method never called
const oilPressureAlertTracker = new OilPressureAlertTracker({...});

// calculateMinOilPressure() is marked deprecated but still exists
```

**Recommendation:** Either:
- Remove deprecated classes entirely, OR
- Add clear documentation explaining retention reason

---

## 3. File-Specific Recommendations

### 3.1 ThresholdContext.jsx

| Issue | Severity | Fix |
|-------|----------|-----|
| Missing useEffect dependency | Medium | Add `loadInitialData` to deps or restructure |
| Context value recreated every render | Medium | Wrap in `useMemo()` |
| No localStorage persistence | Low | Add profile selection persistence |
| No profile validation | Low | Add `validateProfile()` on load |

**Additional Improvements:**
```javascript
// Memoize context value
const value = useMemo(() => ({
  selectedProfileId,
  resolvedProfile,
  // ... all other values
}), [selectedProfileId, resolvedProfile, /* ... deps */]);

// Persist selection
useEffect(() => {
  if (selectedProfileId) {
    localStorage.setItem('selectedThresholdProfile', selectedProfileId);
  }
}, [selectedProfileId]);
```

---

### 3.2 anomalyEngine.js

| Issue | Severity | Fix |
|-------|----------|-----|
| O(n) alert lookup every update | Medium | Use Map for active alerts |
| Loose equality in conditions | Medium | Use `===` with explicit type handling |
| Magic numbers throughout | Low | Extract to constants object |
| Deprecated classes still present | Low | Remove or document |

**Alert Lookup Optimization:**
```javascript
// Current - O(n) every time
const existingAlert = alerts.find(a => a.id === alertId && !a.endTime);

// Better - O(1)
const activeAlerts = new Map(); // alertId -> alert object

function handleAlertState(alertId, isActive, /* ... */) {
  if (isActive) {
    if (!activeAlerts.has(alertId)) {
      const newAlert = { /* ... */ };
      alerts.push(newAlert);
      activeAlerts.set(alertId, newAlert);
    } else {
      const existing = activeAlerts.get(alertId);
      // Update in place
    }
  } else {
    if (activeAlerts.has(alertId)) {
      const existing = activeAlerts.get(alertId);
      existing.endTime = time;
      activeAlerts.delete(alertId);
    }
  }
}
```

---

### 3.3 bplotParsers.js

| Issue | Severity | Fix |
|-------|----------|-----|
| Duplicated engine state machine | High | Extract to shared module |
| Inconsistent RPM thresholds | Medium | Use shared constants |
| No parse error tracking | Low | Add parseErrors array |
| Simple downsampling misses peaks | Low | Use LTTB or min/max preservation |

**RPM Threshold Alignment:**
```javascript
// extractEngineEvents uses hardcoded values
if (!engineRunning && rpm >= 500) { /* start */ }  // Should use config
if (engineRunning && rpm < 200) { /* stop */ }     // Should use config

// Fix:
export function extractEngineEvents(data, config = DEFAULT_VALIDITY_CONFIG) {
  const startThreshold = config.rpmRunningThreshold || 500;
  const stopThreshold = config.rpmCrankingThreshold || 100;
  // ...
}
```

---

### 3.4 bplotProcessData.js

| Issue | Severity | Fix |
|-------|----------|-----|
| Large file (942 lines) | Medium | Split into focused modules |
| detectAlerts() duplicates anomalyEngine logic | Medium | Remove, use anomalyEngine |
| Hardcoded oil pressure thresholds | High | Use BPLOT_THRESHOLDS |

**Suggested Split:**
```
bplotProcessData.js → 
  - bplotAnalysis.js (processBPlotData, calculateOperatingStats)
  - bplotFormatters.js (formatDuration, formatRuntime)
  - bplotDetection.js (detectFuelSystem, getValidDataWindow)
```

---

### 3.5 bplotThresholds.js

| Issue | Severity | Fix |
|-------|----------|-----|
| Oil pressure thresholds wrong | High | Change to 6/8 |
| Duplicate parameter entries (gov1_rpm/Gov1_rpm) | Low | Normalize to single case |
| OILP_state VALUE_MAPPINGS incomplete | Low | Add all valid states |

**OILP_state Fix:**
```javascript
// Current - incomplete
OILP_state: {
  0: 'OK',
  1: 'OK',
  2: 'OK'
}

// Should be:
OILP_state: {
  0: 'OK',
  1: 'Warmup',
  2: 'Low Warning',
  3: 'Critical Low'
}
```

---

### 3.6 bplotTimelineMerge.js

| Issue | Severity | Fix |
|-------|----------|-----|
| mergeChannelStats doesn't handle null values | Medium | Add null checks |
| No validation of file boundaries | Low | Add overlap detection |

**Null Handling Fix:**
```javascript
function mergeChannelStats(statsArray) {
  const merged = {};

  for (const stats of statsArray) {
    if (!stats) continue;

    for (const [channel, channelStats] of Object.entries(stats)) {
      if (!channelStats || channelStats.min === null) continue;  // Add null check
      
      if (!merged[channel]) {
        merged[channel] = { ...channelStats };
      } else {
        // Only merge if both have valid data
        if (merged[channel].min !== null && channelStats.min !== null) {
          merged[channel].min = Math.min(merged[channel].min, channelStats.min);
          merged[channel].max = Math.max(merged[channel].max, channelStats.max);
          // ...
        }
      }
    }
  }
  return merged;
}
```

---

### 3.7 variableDefinitions.js

| Issue | Severity | Fix |
|-------|----------|-----|
| OILP_press category is 'thermal' | Low | Change to 'pressure' |
| Some entries lack 'range' field | Low | Add ranges for consistency |

---

### 3.8 faultSnapshotMapping.js

| Issue | Severity | Fix |
|-------|----------|-----|
| Incomplete snapshot mappings | Low | Sync with CHANNEL_ALIASES |
| No reverse lookup | Low | Add getSnapshotKeyFromBplot() |

---

### 3.9 parsers.js (ECM)

| Issue | Severity | Fix |
|-------|----------|-----|
| Unicode encoding issues | Low | Replace `â€"` with proper em-dash |
| Silent 0 fallback on parse errors | Medium | Track parse errors |

**Unicode Fix:**
```javascript
// Current
export const fmt = (val, decimals = 1) => {
  if (val == null || isNaN(val)) return 'â€"';  // Broken encoding
  
// Fix
export const fmt = (val, decimals = 1) => {
  if (val == null || isNaN(val)) return '—';  // Proper em-dash
```

---

### 3.10 processData.js (ECM)

| Issue | Severity | Fix |
|-------|----------|-----|
| Unicode encoding issues | Low | Replace `Â°` with `°` |
| Defensive null checks inconsistent | Low | Add consistent guards |

---

### 3.11 thresholds.js (ECM)

| Issue | Severity | Fix |
|-------|----------|-----|
| Oil pressure thresholds wrong | High | Change criticalLow to 6, warningLow to 8 |
| Unicode encoding issues | Low | Fix degree symbols |

---

### 3.12 thresholdService.js

| Issue | Severity | Fix |
|-------|----------|-----|
| No request timeout | Medium | Add AbortController |
| No retry logic | Low | Add exponential backoff |

**Timeout Fix:**
```javascript
async function apiCall(endpoint, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);  // 30s timeout

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    // ...
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

### 3.13 configuratorService.js

| Issue | Severity | Fix |
|-------|----------|-----|
| Very minimal - only one function | Low | Consider merging with thresholdService |
| No error details exposed | Low | Return full error response |

---

## 4. Cross-Cutting Concerns

### 4.1 Inconsistent Null/Undefined Handling

**Problem:** Mix of `??` and `||` operators:
```javascript
// Some places use ?? (correct for numbers)
const vsw = row?.Vsw ?? row?.vsw ?? row?.VSW ?? 0;

// Others use || (treats 0 as falsy - bug!)
const rpm = getParamValue(row, 'rpm', columnMap) || 0;
```

**Recommendation:** Use `??` consistently for numeric values.

---

### 4.2 Magic Numbers

**Problem:** Hardcoded values scattered throughout:
- RPM thresholds: 100, 200, 400, 500, 550, 650, 800, 900
- Time periods: 2, 3, 5, 10 seconds
- Pressure values: 0.2, 0.5, 8.24 psi

**Recommendation:** Create shared constants:
```javascript
// lib/constants.js
export const ENGINE_THRESHOLDS = {
  RPM_CRANKING: 100,
  RPM_RUNNING: 500,
  RPM_STABLE: 800,
  RPM_IDLE_MAX: 900
};

export const TIMING = {
  STARTUP_GRACE_SEC: 3,
  STABLE_HOLDOFF_SEC: 2,
  STALE_DATA_THRESHOLD_SEC: 10
};
```

---

### 4.3 Missing TypeScript/JSDoc Types

**Problem:** Complex objects lack type documentation:
- Anomaly rules schema
- Threshold profile structure
- Channel statistics shape

**Recommendation:** Add comprehensive JSDoc:
```javascript
/**
 * @typedef {Object} AnomalyRule
 * @property {string} id - Unique rule identifier
 * @property {string} name - Display name
 * @property {boolean} enabled - Whether rule is active
 * @property {Array<RuleCondition>} conditions - Conditions to evaluate
 * @property {'AND'|'OR'} [logic='AND'] - How to combine conditions
 * @property {'critical'|'warning'|'info'} [severity='warning']
 * @property {string} [category='custom']
 * @property {number} [triggerPersistenceSec]
 * @property {number} [clearPersistenceSec]
 * @property {number} [startDelaySec]
 * @property {number} [stopDelaySec]
 * @property {Array<RuleCondition>} [requireWhen]
 * @property {Array<RuleCondition>} [ignoreWhen]
 */
```

---

## 5. Oil Pressure Threshold Updates

### Summary of All Required Changes

```javascript
// 1. ThresholdContext.jsx - FALLBACK_THRESHOLDS
oilPressure: {
  critical: { min: 6 },   // was 10
  warning: { min: 8 },    // was 20
}

// 2. anomalyEngine.js - checkOilPressure() fallbacks (~line 1062)
const warningThreshold = userWarningMin !== undefined ? userWarningMin : 8;   // was 20
const criticalThreshold = userCriticalMin !== undefined ? userCriticalMin : 6; // was 10

// 3. bplotThresholds.js - BPLOT_THRESHOLDS
oilPressure: {
  warning_low: 8,    // was 20
  critical_low: 6,   // was 10
  idle_min: 6        // was 15
}

// 4. thresholds.js - ECM_THRESHOLDS  
oilPressure: {
  warningLow: 8,     // was 25
  criticalLow: 6     // was 15
}
```

---

## 6. Implementation Priority

### Phase 1: Critical Fixes (Do Immediately)
1. ✅ Update oil pressure thresholds in all 4 files
2. ✅ Fix race condition in ThresholdContext.selectProfile
3. ✅ Add memory leak guard in RuleTimingTracker

### Phase 2: Architecture (Next Sprint)
4. Extract shared engine state module
5. Consolidate parameter definitions
6. Standardize threshold structure

### Phase 3: Quality (Ongoing)
7. Add JSDoc types for complex objects
8. Replace magic numbers with constants
9. Fix unicode encoding issues
10. Add request timeouts to API calls

### Phase 4: Optimization (When Needed)
11. O(1) alert lookups in anomalyEngine
12. Improved downsampling algorithm
13. Column map caching

---

## Appendix A: File Dependency Graph

```
ThresholdContext.jsx
  └── thresholdService.js
        └── API (/api/thresholds)

bplotProcessData.js
  ├── bplotParsers.js
  │     └── bplotThresholds.js
  ├── bplotThresholds.js
  └── anomalyEngine.js

processData.js (ECM)
  └── thresholds.js (ECM)

parsers.js (ECM)
  └── (standalone)

bplotTimelineMerge.js
  └── (standalone)

faultSnapshotMapping.js
  └── (standalone)

variableDefinitions.js
  └── (standalone)

configuratorService.js
  └── API (/api/configurator)
```

---

## Appendix B: Constants to Extract

```javascript
// lib/constants.js

export const OIL_PRESSURE = {
  CRITICAL_MIN: 6,
  WARNING_MIN: 8,
  IDLE_MIN: 6
};

export const RPM_THRESHOLDS = {
  CRANKING: 100,
  RUNNING: 500,
  STABLE: 800,
  IDLE_MAX: 900,
  WARNING_HIGH: 3200,
  CRITICAL_HIGH: 3500,
  OVERSPEED: 3800
};

export const TIMING = {
  STARTUP_GRACE_SEC: 3,
  STABLE_HOLDOFF_SEC: 2,
  STOP_HOLDOFF_SEC: 2,
  STALE_THRESHOLD_SEC: 10,
  CRANK_GRACE_SEC: 2
};

export const BATTERY = {
  CRITICAL_LOW: 10.5,
  WARNING_LOW: 11.5,
  WARNING_HIGH: 30,
  CRITICAL_HIGH: 32
};

export const COOLANT_TEMP = {
  WARNING_HIGH: 220,
  CRITICAL_HIGH: 235,
  GRACE_PERIOD_SEC: 60
};
```

---

*Document generated: Code review of PSI Engine Diagnostics System*
*Files reviewed: 13 JavaScript modules*
*Total lines of code: ~5,500*
