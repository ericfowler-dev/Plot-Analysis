# CODEX: PSI Plot Analyzer - Anomaly & Warning Detection System

> **Purpose**: Comprehensive guidance for Claude Code sub-agents analyzing and improving the PSI Plot Analyzer anomaly and warning detection system.  
> **Version**: 2.0  
> **Last Updated**: January 2026  
> **Repository**: `ericfowler-dev/support` (or similar)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Task 1: Anomaly Detection Control Mechanisms](#task-1-anomaly-detection-control-mechanisms)
4. [Task 2: Hard-Coded vs Configurable Detection](#task-2-hard-coded-vs-configurable-detection)
5. [Task 3: Configurator Hierarchy Problem](#task-3-configurator-hierarchy-problem)
6. [Task 4: Baseline Repository Data Strategy](#task-4-baseline-repository-data-strategy)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Appendix: Code References](#appendix-code-references)

---

## Executive Summary

### Current System State

The PSI Plot Analyzer has **two parallel detection mechanisms**:

| Mechanism | Location | Purpose | Status |
|-----------|----------|---------|--------|
| **Threshold Profiles** | `server/data/profiles/*.json` | Fixed min/max warnings/critical values | ✅ Configurable via Configurator UI |
| **Statistical Baselines** | `server/data/baselines/good_baseline.json` | p05/p95 percentile bounds | ⚠️ Limited data, UI exists but not fully integrated |

### Key Findings

1. **Anomaly detection is controlled by `src/lib/anomalyEngine.js`** - a 1,726-line file containing all detection logic
2. **Hard-coded values exist** for engine state thresholds (RPM cutoffs) but most detection parameters ARE configurable
3. **The configurator hierarchy problem is real** - baselines support `Group → Size → Application` but profiles only partially implement this
4. **Baseline data is sparse** - only 1-8 files per engine category, mostly 22L PSI HD

### Critical Gaps

- Baselines are not used for anomaly detection in the current flow (only profiles)
- No rate-of-change detection is implemented
- Engine state thresholds are partially hard-coded
- No RPM-binned baseline statistics

---

## Architecture Overview

### Directory Structure (Actual)

```
├── server/
│   ├── data/
│   │   ├── baselines/
│   │   │   ├── good_baseline.json      # Statistical baselines (5,327 lines)
│   │   │   ├── new_good_baseline.json  # Generated output
│   │   │   └── _index.json             # Baseline index
│   │   ├── profiles/
│   │   │   ├── global-defaults.json    # Root profile (all inherit from this)
│   │   │   ├── psi-hd-base.json        # PSI HD family base
│   │   │   ├── psi-hd-22l-powersystems.json
│   │   │   ├── psi-industrial-base.json
│   │   │   └── _index.json
│   │   └── configurator.json
│   ├── python/
│   │   ├── baseline_generator.py       # Generates baselines from CSV files
│   │   ├── bplt_converter.py
│   │   └── bplt_reader_core.py
│   ├── routes/
│   │   ├── baselines.js
│   │   ├── configurator.js
│   │   ├── thresholds.js
│   │   └── upload.js
│   └── utils/
│       ├── baselineStore.js            # Baseline data management
│       ├── profileLoader.js            # Profile loading + inheritance
│       ├── thresholdMerger.js          # Deep merge + inheritance resolution
│       └── configuratorStore.js
│
├── src/
│   ├── lib/
│   │   ├── anomalyEngine.js            # ⭐ CORE: All detection logic (1,726 lines)
│   │   ├── engineState.js              # Engine state machine (OFF→CRANKING→RUNNING→STOPPING)
│   │   ├── thresholdService.js         # API calls for profiles
│   │   └── bplotProcessData.js
│   ├── contexts/
│   │   └── ThresholdContext.jsx        # React state for thresholds
│   └── components/
│       ├── admin/
│       │   ├── ThresholdEditor.jsx
│       │   ├── ThresholdManager.jsx
│       │   ├── RuleBuilder.jsx
│       │   └── Config3Editor.jsx
│       ├── ProfileSelector.jsx
│       └── BaselineSelector.jsx
```

### Data Flow

```
[.bplt File Upload]
       ↓
[bplt_reader_core.py] → Parse binary to JSON
       ↓
[bplotProcessData.js] → Normalize data
       ↓
[ThresholdContext.jsx] → Load selected profile
       ↓
[thresholdMerger.js] → Resolve profile inheritance
       ↓
[anomalyEngine.js::detectAnomalies()] ← Main entry point
       ├── createColumnMap() → Map parameter names
       ├── EngineStateTracker.update() → Track engine state
       ├── checkBatteryVoltage()
       ├── checkCoolantTemp()
       ├── checkOilPressure()
       ├── checkRPM()
       ├── checkFuelTrim()
       ├── checkKnock()
       ├── checkSignalQuality()
       └── checkAnomalyRules() → Custom rules from profile
       ↓
[UI Display] → Alerts, charts, summary
```

---

## Task 1: Anomaly Detection Control Mechanisms

### 1.1 Primary Entry Point

**File**: `src/lib/anomalyEngine.js`  
**Function**: `detectAnomalies(data, thresholds, options)`

```javascript
// Lines 833-840
export function detectAnomalies(data, thresholds, options = {}) {
  const {
    gracePeriod = 5,    // seconds to ignore at start
    sampleRate = 1,     // samples per second
    minDuration = 0,    // minimum alert duration
    debug = false
  } = options;
  // ...
}
```

### 1.2 Detection Mechanisms

#### A. Threshold-Based Detection (Profile-Driven)

Located in `anomalyEngine.js`, lines 972-1016:

```javascript
// Run threshold checks
if (thresholds.thresholds) {
  // Battery voltage check
  if (thresholds.thresholds.battery?.enabled !== false) {
    checkBatteryVoltage(row, time, thresholds.thresholds.battery, ...);
  }
  
  // Coolant temperature check
  if (thresholds.thresholds.coolantTemp?.enabled !== false && isRunning) {
    checkCoolantTemp(row, time, thresholds.thresholds.coolantTemp, ...);
  }
  
  // Oil pressure check - uses engine state tracker
  if (thresholds.thresholds.oilPressure?.enabled !== false) {
    checkOilPressure(row, time, thresholds.thresholds.oilPressure, ...);
  }
  
  // ... RPM, fuel trim, knock checks
}

// Run custom anomaly rules
if (thresholds.anomalyRules && thresholds.anomalyRules.length > 0) {
  checkAnomalyRules(row, time, thresholds.anomalyRules, ...);
}
```

#### B. Engine State Machine

**File**: `src/lib/engineState.js`

States: `OFF` → `CRANKING` → `RUNNING_UNSTABLE` → `RUNNING_STABLE` → `STOPPING`

```javascript
// Default thresholds (can be overridden by profile)
const DEFAULT_ENGINE_STATE_CONFIG = {
  rpmCrankingThreshold: 100,    // RPM to detect cranking
  rpmRunningThreshold: 650,     // RPM to consider "running"
  rpmStableThreshold: 800,      // RPM for stable operation
  startHoldoffSeconds: 3,       // Wait after start before checking
  stableHoldoffSeconds: 2,      // Wait before declaring stable
  stopHoldoffSeconds: 2,        // Time in stopping before OFF
  shutdownRpmRate: -300,        // RPM/sec to detect shutdown
  historyWindowSize: 10         // Samples for smoothing
};
```

#### C. Custom Anomaly Rules

Rules are defined in profiles and evaluated by `checkAnomalyRules()`:

```json
// From global-defaults.json, lines 217-240
{
  "id": "dtc-active",
  "name": "Active Diagnostic Trouble Code",
  "description": "Malfunction indicator lamp is active while engine running",
  "enabled": true,
  "conditions": [
    { "param": "MILout_mirror", "operator": "==", "value": 1 }
  ],
  "requireWhen": [
    { "param": "rpm", "operator": ">=", "value": 500 }
  ],
  "logic": "AND",
  "duration": 5,
  "severity": "warning",
  "category": "fault"
}
```

#### D. Signal Quality Detection

Detects sensor dropouts (NaN/null values during engine operation):

```javascript
// anomalyEngine.js, lines 671-764
class SignalQualityAnalyzer {
  constructor(config = {}, availableColumns = []) {
    this.enabled = config.enabled !== false;
    this.alertSeverity = config.alertSeverity ?? SEVERITY.INFO;
    this.suppressRelatedAlerts = config.suppressRelatedAlerts !== false;
    this.defaultDropoutGapSec = config.defaults?.dropoutGapSec ?? 0.5;
    // ...
  }
}
```

### 1.3 Profile Inheritance System

**File**: `server/utils/thresholdMerger.js`

```javascript
// Resolve a profile with all inherited values merged
export async function resolveProfile(profileId) {
  const hierarchy = await getProfileHierarchy(profileId);
  // hierarchy = [global-defaults, psi-hd-base, psi-hd-22l-powersystems]
  
  const resolved = {
    profileId: leafProfile.profileId,
    inheritanceChain: hierarchy.map(p => p.profileId),
    thresholds: mergeThresholds(hierarchy),      // Deep merge
    anomalyRules: mergeAnomalyRules(hierarchy),  // Later wins by ID
    metadata: hierarchy[0].metadata || {}
  };
  
  return resolved;
}
```

### 1.4 Baseline System (Currently Underutilized)

**File**: `server/utils/baselineStore.js`

The baseline system exists and has:
- Group → Size → Application hierarchy
- p05/p95 percentile statistics with padding
- API endpoints for CRUD operations

**However**: Baselines are NOT currently used in `anomalyEngine.js` for detection. The `detectAnomalies()` function only receives `thresholds` (from profiles), not baseline data.

```javascript
// Current call signature - no baseline parameter
export function detectAnomalies(data, thresholds, options = {})

// Baseline data structure exists but isn't passed:
// good_baseline.json -> groups -> "PSI HD" -> "22L" -> "Power Systems" -> { param: { p05_padded, p95_padded } }
```

---

## Task 2: Hard-Coded vs Configurable Detection

### 2.1 Classification Matrix

| Parameter | Location | Hard-Coded? | Configurable Via |
|-----------|----------|-------------|------------------|
| Engine running threshold | `engineState.js` | **YES**: 650 RPM default | Profile can override via `oilPressure.rpmThreshold` |
| Engine stable threshold | `engineState.js` | **YES**: 800 RPM default | Profile can override via `oilPressure.rpmStableThreshold` |
| Cranking threshold | `engineState.js` | **YES**: 100 RPM default | Profile can override via `oilPressure.rpmCrankingThreshold` |
| Startup holdoff | `engineState.js` | **YES**: 3 seconds default | Profile can override via `oilPressure.startHoldoffSeconds` |
| Grace period | `anomalyEngine.js` | **YES**: 5 seconds default | Options parameter |
| Parameter mappings | `anomalyEngine.js` | **YES**: `DEFAULT_PARAM_MAPPINGS` | Profile can extend via `metadata.parameterMappings` |
| Oil pressure thresholds | Profile | No | `thresholds.oilPressure.warning.min`, `.critical.min` |
| Coolant temp thresholds | Profile | No | `thresholds.coolantTemp.warning.max`, `.critical.max` |
| Fuel trim thresholds | Profile | No | `thresholds.fuelTrim.closedLoop.*`, `.adaptive.*` |
| Signal dropout gap | Profile | No | `thresholds.signalQuality.defaults.dropoutGapSec` |
| Custom rules | Profile | No | `anomalyRules[]` |

### 2.2 Hard-Coded Values in `anomalyEngine.js`

```javascript
// Line 59-73: Default parameter mappings (HARD-CODED)
const DEFAULT_PARAM_MAPPINGS = {
  battery: ['Vbat', 'battery_voltage', 'VBAT', 'vbat'],
  coolantTemp: ['ECT', 'coolant_temp', 'engine_coolant_temp', 'ect'],
  oilPressure: ['OILP_press', 'oil_pressure', 'OIL_PRESS', 'oilp_press'],
  // ... etc
};

// Line 191-195: Engine running check (HARD-CODED threshold)
function isEngineRunning(row, columnMap) {
  const rpm = getParamValue(row, 'rpm', columnMap);
  const vsw = row.Vsw ?? row.vsw ?? row.VSW;
  return rpm > 400 && (vsw === undefined || vsw > 1);  // 400 RPM hard-coded
}
```

### 2.3 Configurable Values in Profile

From `global-defaults.json`:

```json
{
  "thresholds": {
    "oilPressure": {
      "enabled": true,
      "critical": { "min": 6 },
      "warning": { "min": 8 },
      "rpmThreshold": 725,
      "ignoreWhen": [
        { "param": "Vsw", "operator": "<", "value": 8 }
      ],
      "requireWhen": [
        { "param": "spark_shutoff_chk", "operator": "==", "value": 0 }
      ]
    },
    "signalQuality": {
      "enabled": true,
      "alertSeverity": "info",
      "suppressRelatedAlerts": true,
      "defaults": { "dropoutGapSec": 0.5 },
      "channels": {
        "OILP_press": {
          "enabled": true,
          "dropoutGapSec": 0.5,
          "suppressAlerts": ["oil_pressure_warning_low", "oil_pressure_critical_low"]
        }
      }
    }
  }
}
```

### 2.4 Recommendations for Hard-Coded Values

| Value | Current Location | Recommended Action |
|-------|------------------|-------------------|
| `rpm > 400` for running | `anomalyEngine.js:194` | Move to profile: `engineState.isRunningRpmThreshold` |
| `DEFAULT_PARAM_MAPPINGS` | `anomalyEngine.js:59` | Already extendable via profile `metadata.parameterMappings` ✓ |
| Default grace period (5s) | `anomalyEngine.js:835` | Add to profile: `detection.gracePeriodSeconds` |
| Engine state defaults | `engineState.js:13-22` | Already overridable via `oilPressure.*` config ✓ |

---

## Task 3: Configurator Hierarchy Problem

### 3.1 Current State Analysis

**The Problem**: Profiles support inheritance (`parent` field) but don't enforce the `Group → Size → Application` hierarchy that baselines use.

**Current Profile Structure**:
```
global-defaults.json (parent: null)
├── psi-hd-base.json (parent: global-defaults)
│   └── psi-hd-22l-powersystems.json (parent: psi-hd-base)
└── psi-industrial-base.json (parent: global-defaults)
```

**Current Baseline Structure** (from `good_baseline.json`):
```json
{
  "groups": {
    "PSI HD": {
      "17L": { "Power Systems": { /* params */ } },
      "22L": { "Power Systems": { /* params */ } }
    },
    "PSI Industrial": {
      "5.7L": { "Power Systems": { /* params */ } }
    }
  }
}
```

### 3.2 The Disconnect

The baseline store (`baselineStore.js`) has proper hierarchy support:

```javascript
// baselineStore.js lines 231-261
export async function addBaselineApplication(groupName, sizeName, appName) {
  // Creates hierarchy: group -> size -> application
}

export async function getBaselineForApplication(groupName, sizeName, appName) {
  return data?.groups?.[group]?.[size]?.[app] || null;
}
```

But the profile loader (`profileLoader.js`) only uses a flat `parent` reference:

```javascript
// profileLoader.js lines 288-309
export async function getProfileHierarchy(profileId) {
  const hierarchy = [];
  let currentId = profileId;
  
  while (currentId) {
    const profile = await loadProfile(currentId);
    hierarchy.unshift(profile);
    currentId = profile.parent;  // Only follows parent chain
  }
  
  return hierarchy;
}
```

### 3.3 Required Changes

#### A. Profile Schema Enhancement

Add hierarchical fields to profile structure:

```json
{
  "profileId": "psi-hd-22l-powersystems",
  "name": "PSI HD 22L Power Systems",
  "parent": "psi-hd-base",
  
  // NEW: Hierarchical classification
  "classification": {
    "productGroup": "PSI HD",
    "engineSize": "22L",
    "application": "Power Systems"
  },
  
  "thresholds": { /* ... */ }
}
```

#### B. Profile Resolution with Baseline Fallback

Modify `thresholdMerger.js`:

```javascript
// NEW: Resolve profile with baseline integration
export async function resolveProfileWithBaseline(profileId, baselineSelection) {
  const profileResolved = await resolveProfile(profileId);
  
  // If baseline selection provided, merge baseline bounds
  if (baselineSelection?.group && baselineSelection?.size && baselineSelection?.application) {
    const baseline = await getBaselineForApplication(
      baselineSelection.group,
      baselineSelection.size,
      baselineSelection.application
    );
    
    if (baseline) {
      profileResolved.baseline = baseline;
      profileResolved.baselineSource = `${baselineSelection.group}/${baselineSelection.size}/${baselineSelection.application}`;
    }
  }
  
  return profileResolved;
}
```

#### C. Anomaly Engine Integration

Modify `anomalyEngine.js` to use baseline data:

```javascript
// Add baseline check function
function checkBaselineAnomaly(paramName, value, baseline, alerts, startTimes, values, time) {
  const paramBaseline = baseline?.[paramName];
  if (!paramBaseline) return;
  
  const { p05_padded, p95_padded } = paramBaseline;
  
  if (value < p05_padded) {
    handleAlertState(`baseline_low_${paramName}`, true, time, value, alerts, startTimes, values, {
      name: `${paramName} below baseline`,
      description: `Value ${value.toFixed(2)} below expected minimum ${p05_padded.toFixed(2)}`,
      severity: SEVERITY.INFO,
      category: CATEGORIES.CUSTOM
    });
  } else if (value > p95_padded) {
    handleAlertState(`baseline_high_${paramName}`, true, time, value, alerts, startTimes, values, {
      name: `${paramName} above baseline`,
      description: `Value ${value.toFixed(2)} above expected maximum ${p95_padded.toFixed(2)}`,
      severity: SEVERITY.INFO,
      category: CATEGORIES.CUSTOM
    });
  }
}
```

### 3.4 UI Changes Required

The `BaselineSelector.jsx` component already exists but needs to be integrated with profile selection:

```jsx
// Current: Baseline selector is independent
<BaselineSelector 
  selection={baselineSelection}
  onChange={setBaselineSelection}
/>

// Needed: Link baseline selection to profile resolution
<ThresholdProvider>
  <ProfileSelector onProfileChange={handleProfileChange} />
  <BaselineSelector 
    selection={baselineSelection}
    onChange={(sel) => {
      setBaselineSelection(sel);
      // Trigger re-resolution with new baseline
      resolveProfileWithBaseline(selectedProfileId, sel);
    }}
  />
</ThresholdProvider>
```

---

## Task 4: Baseline Repository Data Strategy

### 4.1 Current Baseline Coverage

From `good_baseline.json` analysis:

| Product Group | Engine Size | Application | Parameters | Files |
|---------------|-------------|-------------|------------|-------|
| PSI HD | 17L | Power Systems | 45 | 1 |
| PSI HD | 22L | Power Systems | 148 | 8 |
| PSI Industrial | 5.7L | Power Systems | 42 | 1 |

**Total Coverage**: 3 engine/application combinations out of potentially 20+

### 4.2 Target Coverage Matrix

| Product Group | Engine Size | Application | Priority | Target Files |
|---------------|-------------|-------------|----------|--------------|
| PSI HD | 8.8L | Power Systems | HIGH | 10-20 |
| PSI HD | 8.8L | Generator | MEDIUM | 5-10 |
| PSI HD | 11L | Power Systems | HIGH | 10-20 |
| PSI HD | 17L | Power Systems | HIGH | 10-20 |
| PSI HD | 22L | Power Systems | ✅ DONE (8) | 10-20 |
| PSI HD | 53L | Power Systems | MEDIUM | 5-10 |
| PSI Industrial | 2.4L | Generator | MEDIUM | 5-10 |
| PSI Industrial | 4.3L | Industrial | MEDIUM | 5-10 |
| PSI Industrial | 5.7L | Generator | HIGH | 10-20 |
| PSI Industrial | 8.8L | Enclosure | HIGH | 10-20 |

### 4.3 File Collection Process

#### A. File Naming Convention

```
{EngineSize}_{ProductGroup}_{Application}_{Quality}_{Sequence}.{ext}

Examples:
22L_PSI-HD_PowerSystems_good_001.bplt
22L_PSI-HD_PowerSystems_good_001.csv  (converted)
8.8L_PSI-Industrial_Enclosure_good_001.bplt
```

#### B. Metadata Sidecar File

Create `{folder}_metadata.json` for each engine folder:

```json
{
  "group": "PSI HD",
  "size": "22L", 
  "files": [
    {
      "filename": "22L_PSI-HD_PowerSystems_good_001.csv",
      "quality": "good",
      "application": "Power Systems",
      "operating_conditions": {
        "rpm_range": "idle to full",
        "load_profile": "variable",
        "hour_meter": 12500
      },
      "date_collected": "2026-01-15",
      "source": "Field service diagnostic"
    }
  ]
}
```

### 4.4 Baseline Generator Enhancement

Current generator (`server/python/baseline_generator.py`) needs enhancement:

```python
# Current: Simple percentile calculation
def main():
    for metadata_path in BASELINE_DIR.rglob("*_metadata.json"):
        # ... loads files, computes p05/p95

# ENHANCED: Add filtering and RPM binning
def generate_enhanced_baseline(files, metadata):
    all_data = []
    
    for file_info in metadata['files']:
        if file_info['quality'] != 'good':
            continue
            
        df = pd.read_csv(file_info['path'])
        
        # Filter to running data only
        if 'rpm' in df.columns:
            df = df[df['rpm'] > 550]
        
        # Remove startup/shutdown transients
        df = remove_transients(df, samples=100)
        
        all_data.append(df)
    
    combined = pd.concat(all_data, ignore_index=True)
    
    # Calculate global stats
    stats = compute_percentile_stats(combined)
    
    # Calculate RPM-binned stats
    rpm_bins = [(600, 800), (800, 1200), (1200, 1600), (1600, 2000)]
    rpm_binned_stats = {}
    
    for (rpm_low, rpm_high) in rpm_bins:
        bin_data = combined[(combined['rpm'] >= rpm_low) & (combined['rpm'] < rpm_high)]
        if len(bin_data) > 100:
            rpm_binned_stats[f"{rpm_low}-{rpm_high}"] = compute_percentile_stats(bin_data)
    
    return {
        'global': stats,
        'rpm_bins': rpm_binned_stats
    }
```

### 4.5 Parameters to Exclude from Baseline

These should NOT be included in baseline statistics:

```python
EXCLUDED_PARAMS = [
    # Counters (always increase)
    'Time', 'Hours', 'Hrs_since_MIL', 'Hrs_since_clr', 'ECU_on_time',
    
    # Control targets (not measured values)
    'RPM_Gov', 'RPM_Dmd', 'Target_RPM', 'TPS_cmd_pct',
    
    # Binary/diagnostic flags
    'Eng_Run', 'Eng_Crank', 'Eng_Stall', 'MILout_mirror',
    
    # Calibration references
    'CAL_ID', 'CAL_CRC', 'FW_Ver',
    
    # Raw sensor counts
    'IAT_raw', 'ECT_raw', 'MAP_raw',
    
    # Communication/status
    'CAN_err', 'Comm_status',
    
    # Governor/control state
    'I_Gov1_acc', 'LoadLim_max_TPS'
]
```

### 4.6 RPM-Binned Baseline Structure

Enhanced `good_baseline.json` structure:

```json
{
  "groups": {
    "PSI HD": {
      "22L": {
        "Power Systems": {
          "OILP_press": {
            "global": {
              "p05_padded": 35,
              "p95_padded": 75
            },
            "rpm_bins": {
              "600-800": { "p05_padded": 35, "p95_padded": 50 },
              "800-1200": { "p05_padded": 45, "p95_padded": 60 },
              "1200-1600": { "p05_padded": 55, "p95_padded": 70 },
              "1600+": { "p05_padded": 60, "p95_padded": 75 }
            }
          }
        }
      }
    }
  }
}
```

---

## Implementation Roadmap

### Phase 1: Baseline Integration (Weeks 1-2)

1. [ ] Modify `anomalyEngine.js` to accept baseline data parameter
2. [ ] Add baseline bounds checking function
3. [ ] Update `detectAnomalies()` call signature
4. [ ] Connect `BaselineSelector` to detection flow

### Phase 2: Profile Hierarchy (Weeks 2-3)

1. [ ] Add `classification` field to profile schema
2. [ ] Create `resolveProfileWithBaseline()` function
3. [ ] Update Configurator UI for hierarchical selection
4. [ ] Add profile-to-baseline matching logic

### Phase 3: Baseline Data Collection (Weeks 3-6)

1. [ ] Create file collection checklist per engine
2. [ ] Update `baseline_generator.py` with filtering
3. [ ] Add RPM-binned statistics
4. [ ] Implement excluded parameters list
5. [ ] Validate baseline quality

### Phase 4: Detection Enhancements (Weeks 6-8)

1. [ ] Add rate-of-change detection
2. [ ] Implement RPM-aware baseline checks
3. [ ] Move hard-coded values to configuration
4. [ ] Add state-dependent thresholds

---

## Appendix: Code References

### Key Functions

| Function | File | Line | Purpose |
|----------|------|------|---------|
| `detectAnomalies` | `anomalyEngine.js` | 833 | Main entry point |
| `checkOilPressure` | `anomalyEngine.js` | ~1100 | Oil pressure detection |
| `checkAnomalyRules` | `anomalyEngine.js` | 1420 | Custom rule evaluation |
| `EngineStateTracker.update` | `engineState.js` | 75 | State machine |
| `resolveProfile` | `thresholdMerger.js` | 80 | Profile inheritance |
| `loadBaselineData` | `baselineStore.js` | 103 | Load baselines |
| `getBaselineForApplication` | `baselineStore.js` | 344 | Get specific baseline |

### Profile Schema Reference

```typescript
interface Profile {
  profileId: string;           // e.g., "psi-hd-22l-powersystems"
  name: string;                // Display name
  description: string;
  parent: string | null;       // Parent profile ID
  engineFamily: string | null; // "PSI HD", "PSI Industrial"
  fuelType: string | null;     // "Natural Gas", "Propane"
  application: string | null;  // "Power Systems", "Generator"
  version: string;
  status: "active" | "draft";
  
  thresholds: {
    battery?: ThresholdConfig;
    coolantTemp?: ThresholdConfig;
    oilPressure?: OilPressureConfig;
    rpm?: ThresholdConfig;
    fuelTrim?: FuelTrimConfig;
    knock?: KnockConfig;
    signalQuality?: SignalQualityConfig;
  };
  
  anomalyRules: AnomalyRule[];
  
  metadata?: {
    parameterMappings?: Record<string, string[]>;
  };
}
```

### Baseline Schema Reference

```typescript
interface BaselineData {
  source: string;
  tolerance: {
    strategy: string;
    min_padding: Record<string, number>;
    range_padding_pct: number;
    range_padding_cap_pct: number;
  };
  groups: {
    [productGroup: string]: {
      [engineSize: string]: {
        [application: string]: {
          [parameter: string]: {
            p05_mean: number;
            p95_mean: number;
            p05_padded: number;
            p95_padded: number;
            files: number;
          };
        };
      };
    };
  };
}
```

---

*Document Version: 2.0*  
*Based on actual codebase analysis*  
*For Claude Code Sub-Agent Use*
