# CODEX: PSI Plot Analyzer - Anomaly & Warning Detection System

> **Purpose**: This document provides comprehensive guidance for Claude Code sub-agents working on the PSI Plot Analyzer application. It covers the architecture, analysis requirements, and improvement recommendations for the anomaly and warning detection system.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Analysis Tasks](#architecture-analysis-tasks)
3. [Task 1: Anomaly Detection Control Mechanisms](#task-1-anomaly-detection-control-mechanisms)
4. [Task 2: Hard-Coded vs Configurable Detection](#task-2-hard-coded-vs-configurable-detection)
5. [Task 3: Configurator Hierarchy Problem](#task-3-configurator-hierarchy-problem)
6. [Task 4: Baseline Repository Data Strategy](#task-4-baseline-repository-data-strategy)
7. [File Structure Reference](#file-structure-reference)
8. [Implementation Priorities](#implementation-priorities)

---

## Project Overview

### Application Context

The **PSI Plot Analyzer** is a diagnostic tool for Power Solutions International (PSI) engines that:

- Analyzes `.bplt` (binary plot) files from engine telemetry
- Analyzes ECM (Engine Control Module) data exports (`.xlsx`)
- Detects anomalies in engine operating parameters
- Generates warnings based on threshold violations
- Supports multiple engine families (PSI HD, PSI Industrial)
- Covers multiple engine sizes (2.4L through 53L)
- Handles various applications (Power Systems, Generator, Pump, etc.)

### Technology Stack

- **Frontend**: Next.js with React, Tailwind CSS
- **Backend**: Node.js server
- **Data Processing**: Python scripts for `.bplt` parsing and baseline generation
- **Storage**: JSON-based configuration and baseline files

### Repository Structure (Expected)

```
/
├── src/
│   └── app/
│       └── (dashboard)/
│           ├── cases/
│           ├── charts/
│           └── overview/
├── server/
│   ├── data/
│   │   ├── profiles/          # Threshold configuration files
│   │   │   ├── global-defaults.json
│   │   │   ├── psi-hd-base.json
│   │   │   └── [engine-specific].json
│   │   └── baselines/         # Statistical baseline data
│   │       └── good_baseline.json
│   ├── python/
│   │   ├── bplt_parser.py     # Binary plot file parser
│   │   └── bplt_baseline.py   # Baseline statistics generator
│   └── utils/
│       ├── anomalyDetector.js # Core anomaly detection logic
│       ├── baselineStore.js   # Baseline data management
│       └── profileLoader.js   # Profile configuration loader
├── example_files/             # Sample CSV/BPLT files
└── uploads/                   # User uploaded files
```

---

## Architecture Analysis Tasks

### Sub-Agent Instructions

When analyzing this codebase, focus on these four key areas in sequential order. Each task builds on findings from the previous task.

---

## Task 1: Anomaly Detection Control Mechanisms

### Objective

Identify and document all mechanisms that control anomaly detection behavior.

### Analysis Checklist

- [ ] Locate the primary anomaly detection entry point
- [ ] Map the data flow from file upload → parsing → detection → display
- [ ] Document all configuration sources
- [ ] Identify decision points where detection behavior branches

### Expected Components to Analyze

#### 1.1 Statistical Baselines (`server/data/baselines/`)

**File**: `good_baseline.json`

**Structure**:
```json
{
  "source": "aggregated_good_data",
  "tolerance": {
    "strategy": "percentile_with_padding",
    "padding_pct": 10
  },
  "groups": {
    "PSI HD": {
      "22L": {
        "Power Systems": {
          "rpm": {
            "p05": 1793,
            "p95": 1808,
            "p05_padded": 1791.3,
            "p95_padded": 1809.5,
            "mean": 1800,
            "std": 4.2,
            "files": 8
          }
          // ... more parameters
        }
      }
    }
  }
}
```

**Key Questions**:
- How are p05/p95 values calculated?
- What does "padding_pct" actually do in the detection logic?
- Is there rate-of-change detection separate from absolute thresholds?

#### 1.2 Threshold Profiles (`server/data/profiles/`)

**Inheritance Chain**: `global-defaults.json` → `psi-hd-base.json` → `[specific].json`

**Structure**:
```json
{
  "name": "psi-hd-base",
  "inherits": "global-defaults",
  "parameters": {
    "oilPressure": {
      "warning": { "min": 8, "max": null },
      "critical": { "min": 5, "max": null },
      "persistence": 5,
      "engineStates": ["running"]
    },
    "coolantTemp": {
      "warning": { "min": null, "max": 220 },
      "critical": { "min": null, "max": 235 }
    }
  },
  "rules": [
    {
      "name": "low_oil_pressure_at_idle",
      "condition": "rpm < 800 AND oilPressure < 15",
      "severity": "warning",
      "message": "Low oil pressure at idle"
    }
  ]
}
```

**Key Questions**:
- Where is profile inheritance resolved?
- How do conditional rules interact with simple thresholds?
- Are rules evaluated in order or in parallel?

#### 1.3 Detection Logic Location

Search for these files/functions:
- `anomalyDetector.js` or similar
- Functions named: `detectAnomalies`, `checkThresholds`, `evaluateRules`
- Python scripts that might run detection

**Document**:
- Entry point function signature
- Parameters passed in
- Return value structure
- Error handling approach

### Deliverable for Task 1

Create a flowchart or structured document showing:
```
[Input File] 
    ↓
[Parser (bplt_parser.py)]
    ↓
[Data Normalization]
    ↓
[Load Baseline] ←→ [Load Profile]
    ↓
[Anomaly Detector]
    ├── Baseline Check (statistical)
    ├── Threshold Check (configured)
    └── Rule Evaluation (conditional)
    ↓
[Results Aggregation]
    ↓
[UI Display]
```

---

## Task 2: Hard-Coded vs Configurable Detection

### Objective

Determine which detection behaviors are hard-coded in application logic versus configurable through the profiles/baselines.

### Classification Matrix

| Detection Type | Location | Configurable? | Notes |
|----------------|----------|---------------|-------|
| RPM > 550 = "running" | ? | ? | Engine state determination |
| Oil pressure warning | Profile | Yes | Min/max thresholds |
| Rate-of-change limits | ? | ? | e.g., 5°F/min for temps |
| Persistence requirements | Profile | Partial | Some may be hard-coded |
| Excluded parameters | ? | ? | Hours, Gov RPM, etc. |
| Outlier bounds | Baseline | Yes | p05/p95 padded values |

### Analysis Steps

#### 2.1 Search for Hard-Coded Values

```javascript
// Look for patterns like:
if (rpm > 550) { /* running */ }
if (rateOfChange > 5) { /* too fast */ }
const EXCLUDED_PARAMS = ['Hours', 'RPM_Gov', 'Hrs_since_MIL'];
```

#### 2.2 Document Configuration Sources

For each configurable item, document:
- Where the config lives
- How it's loaded at runtime
- Whether it can be overridden per-engine

#### 2.3 Identify Configuration Gaps

Parameters that SHOULD be configurable but aren't:
- Engine state thresholds (RPM cutoffs)
- Rate-of-change limits per parameter
- Persistence window sizes
- Parameter exclusion lists

### Deliverable for Task 2

Create a table:

| Behavior | Current State | Recommended State |
|----------|---------------|-------------------|
| Engine running threshold | Hard-coded: 550 RPM | Config: per-engine |
| Temp rate limit | Hard-coded: 5°F/min | Config: per-param |
| Excluded params | Hard-coded array | Config: in profile |
| Outlier padding | Config: 10% | Keep as config |

---

## Task 3: Configurator Hierarchy Problem

### Objective

Analyze why the current configurator is insufficient and design a proper hierarchical structure.

### Current Problem Statement

The configurator currently only works with "group" profiles (e.g., "PSI HD", "PSI Industrial") without the additional branches of:
- **Engine Size** (8.8L, 11L, 17L, 22L, 53L for HD; 2.4L, 4.3L, 5.7L for Industrial)
- **Application** (Power Systems, Generator, Pump, Enclosure, etc.)

### Why This Matters

Different engine sizes have fundamentally different operating characteristics:
- A 22L engine at idle has different oil pressure than an 8.8L
- A Generator application has different RPM targets than a Pump
- Baseline statistics are meaningless if averaged across all sizes

### Current Baseline Structure

```json
{
  "groups": {
    "PSI HD": {
      "22L": {
        "Power Systems": {
          // parameters here
        }
      },
      "8.8L": {
        "Power Systems": { /* different values */ }
      }
    }
  }
}
```

### Required Configurator Changes

#### 3.1 Profile Hierarchy Design

```
global-defaults.json
    │
    ├── psi-hd-base.json
    │   ├── psi-hd-8.8L.json
    │   │   ├── psi-hd-8.8L-powersystems.json
    │   │   └── psi-hd-8.8L-generator.json
    │   ├── psi-hd-22L.json
    │   │   └── psi-hd-22L-powersystems.json
    │   └── psi-hd-53L.json
    │
    └── psi-industrial-base.json
        ├── psi-industrial-5.7L.json
        └── psi-industrial-2.4L.json
```

#### 3.2 Configurator UI Requirements

1. **Step 1**: Select Product Group (PSI HD / PSI Industrial)
2. **Step 2**: Select Engine Size (filtered by product group)
3. **Step 3**: Select Application (filtered by engine availability)
4. **Step 4**: Fine-tune thresholds (inheriting defaults)

#### 3.3 Profile Inheritance Logic

```javascript
function resolveProfile(productGroup, engineSize, application) {
  const profiles = [];
  
  // Start with global defaults
  profiles.push(loadProfile('global-defaults'));
  
  // Add product group base
  profiles.push(loadProfile(`${productGroup}-base`));
  
  // Add engine size specific (if exists)
  const engineProfile = `${productGroup}-${engineSize}`;
  if (profileExists(engineProfile)) {
    profiles.push(loadProfile(engineProfile));
  }
  
  // Add application specific (if exists)
  const appProfile = `${productGroup}-${engineSize}-${application}`;
  if (profileExists(appProfile)) {
    profiles.push(loadProfile(appProfile));
  }
  
  // Deep merge all profiles (later wins)
  return deepMerge(...profiles);
}
```

#### 3.4 Baseline Matching Logic

```javascript
function findBestBaseline(productGroup, engineSize, application, baselines) {
  // Try exact match first
  if (baselines.groups[productGroup]?.[engineSize]?.[application]) {
    return baselines.groups[productGroup][engineSize][application];
  }
  
  // Fall back to engine size (any application)
  if (baselines.groups[productGroup]?.[engineSize]) {
    const apps = Object.values(baselines.groups[productGroup][engineSize]);
    return aggregateBaselines(apps); // Combine all apps for this engine
  }
  
  // Fall back to product group only
  if (baselines.groups[productGroup]) {
    // Aggregate all sizes/apps
    return aggregateAllBaselines(baselines.groups[productGroup]);
  }
  
  // Use global defaults
  return baselines.defaults || null;
}
```

### Deliverable for Task 3

1. Schema for hierarchical profile structure
2. UI wireframe for configurator
3. Code changes required for profile loader
4. Migration plan from flat to hierarchical profiles

---

## Task 4: Baseline Repository Data Strategy

### Objective

Design and implement a strategy for collecting sufficient `.bplt` files to build robust baseline statistics.

### Current State Assessment

From the existing `good_baseline.json`:
- 8 files for 22L PSI HD Power Systems
- Limited RPM coverage (mostly 1800 RPM steady-state)
- Some files have different column structures (spark diagnostics vs standard)
- No coverage for: 8.8L, 11L, 17L, 53L PSI HD; most Industrial sizes

### Target Coverage Matrix

| Product Group | Engine Size | Application | Target Files | Current Files |
|---------------|-------------|-------------|--------------|---------------|
| PSI HD | 8.8L | Power Systems | 10-20 | 0 |
| PSI HD | 8.8L | Generator | 5-10 | 0 |
| PSI HD | 11L | Power Systems | 10-20 | 0 |
| PSI HD | 17L | Power Systems | 10-20 | 0 |
| PSI HD | 22L | Power Systems | 10-20 | 8 |
| PSI HD | 53L | Power Systems | 5-10 | 0 |
| PSI Industrial | 2.4L | Generator | 5-10 | 0 |
| PSI Industrial | 4.3L | Industrial | 5-10 | 0 |
| PSI Industrial | 5.7L | Generator | 5-10 | 0 |
| PSI Industrial | 8.8L | Enclosure | 5-10 | 0 |

### File Naming Convention

```
{EngineSize}_{ProductGroup}_{Application}_{Quality}_{Sequence}.bplt

Examples:
22L_PSI-HD_PowerSystems_good_001.bplt
8.8L_PSI-HD_Generator_good_001.bplt
5.7L_PSI-Industrial_Pump_good_001.bplt
```

### Metadata Sidecar File

For each `.bplt` file, create a `.meta.json`:

```json
{
  "filename": "22L_PSI-HD_PowerSystems_good_001.bplt",
  "product_group": "PSI HD",
  "engine_size": "22L",
  "application": "Power Systems",
  "quality": "good",
  "source": "Field service diagnostic",
  "date_collected": "2026-01-15",
  "hour_meter": 12500,
  "operating_conditions": {
    "rpm_range": "idle to full",
    "load_profile": "variable",
    "ambient_temp": "75°F",
    "fuel_type": "Natural Gas"
  },
  "notes": "Normal operation, data center site, no known issues"
}
```

### Baseline Generation Process

#### 4.1 Data Collection Requirements

For each engine size/application combination, collect files that cover:

1. **RPM Ranges**:
   - Idle (600-800 RPM)
   - Low load (800-1200 RPM)
   - Mid load (1200-1600 RPM)
   - Full load (1600-1800+ RPM)

2. **Operating Conditions**:
   - Cold start sequences
   - Warm running steady-state
   - Load transients (step changes)
   - Cool-down sequences

3. **Hour Meter Ranges**:
   - Low hours (<1,000)
   - Mid-life (1,000-10,000)
   - High hours (>10,000)

#### 4.2 Baseline Statistics Algorithm

```python
def generate_baseline(files, metadata):
    """
    Generate baseline statistics from a collection of .bplt files.
    
    Process:
    1. Parse all files into DataFrames
    2. Filter to running data only (RPM > 550)
    3. Remove startup/shutdown transients
    4. Clean outliers using 3-sigma rolling window
    5. Calculate percentile statistics
    6. Apply padding for tolerance bounds
    """
    
    all_data = []
    for file in files:
        df = parse_bplt(file.path)
        
        # Filter to running only
        df = df[df['rpm'] > 550]
        
        # Remove transients (optional: first/last N samples)
        df = remove_transients(df, samples=100)
        
        all_data.append(df)
    
    combined = pd.concat(all_data, ignore_index=True)
    
    # Calculate per-parameter statistics
    stats = {}
    for column in combined.columns:
        if column in EXCLUDED_PARAMS:
            continue
            
        values = combined[column].dropna()
        
        # Clean outliers with rolling 3-sigma
        values = clean_outliers(values, window=50, sigma=3)
        
        stats[column] = {
            'p05': np.percentile(values, 5),
            'p95': np.percentile(values, 95),
            'mean': np.mean(values),
            'std': np.std(values),
            'min': np.min(values),
            'max': np.max(values),
            'files': len(files),
            'samples': len(values)
        }
        
        # Apply padding
        range_size = stats[column]['p95'] - stats[column]['p05']
        padding = range_size * 0.10  # 10% padding
        stats[column]['p05_padded'] = stats[column]['p05'] - padding
        stats[column]['p95_padded'] = stats[column]['p95'] + padding
    
    return stats
```

#### 4.3 Parameters to Exclude from Anomaly Detection

These parameters should NOT trigger anomalies:

```python
EXCLUDED_PARAMS = [
    # Counters and timers (always increase)
    'Hours', 'Hrs_since_MIL', 'Hrs_since_clr', 'ECU_on_time',
    
    # Governor/control targets (not measured values)
    'RPM_Gov', 'RPM_Dmd', 'Target_RPM',
    
    # Diagnostic flags (binary, not continuous)
    'Eng_Run', 'Eng_Crank', 'Eng_Stall',
    
    # Calibration references
    'CAL_ID', 'CAL_CRC', 'FW_Ver',
    
    # Raw sensor counts (use engineering units instead)
    'IAT_raw', 'ECT_raw', 'MAP_raw',
    
    # Communication status
    'CAN_err', 'Comm_status'
]
```

#### 4.4 RPM-Binned Baseline Enhancement

For more accurate anomaly detection, bin statistics by RPM:

```json
{
  "oilPressure": {
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
```

### Deliverable for Task 4

1. File collection checklist per engine category
2. Automated baseline generation script
3. Validation script to check baseline quality
4. Documentation for adding new baseline data

---

## File Structure Reference

### Expected Files to Analyze

| Path | Description | Priority |
|------|-------------|----------|
| `server/utils/anomalyDetector.js` | Core detection logic | HIGH |
| `server/utils/baselineStore.js` | Baseline data management | HIGH |
| `server/utils/profileLoader.js` | Profile inheritance | HIGH |
| `server/data/profiles/*.json` | Threshold configurations | HIGH |
| `server/data/baselines/good_baseline.json` | Statistical baselines | HIGH |
| `server/python/bplt_parser.py` | BPLT file parser | MEDIUM |
| `server/python/bplt_baseline.py` | Baseline generator | MEDIUM |
| `src/app/(dashboard)/*/page.tsx` | UI components | MEDIUM |
| `src/components/AnomalyDisplay.*` | Anomaly visualization | MEDIUM |

### Key Functions to Locate

```javascript
// Detection entry points
detectAnomalies(data, options)
checkThreshold(value, config)
evaluateRule(rule, context)
isOutlier(value, baseline)

// Configuration loading
loadProfile(name)
resolveInheritance(profile)
getBaseline(group, size, app)

// Data processing
parseValue(raw, parameter)
applyEngineState(data)
filterRunningData(df)
```

---

## Implementation Priorities

### Phase 1: Analysis & Documentation (This Sprint)

1. Complete Task 1-4 analysis
2. Document current state vs desired state
3. Create detailed technical specifications

### Phase 2: Configuration Refactoring

1. Implement hierarchical profile structure
2. Update profile loader for inheritance
3. Add engine size/application to configurator UI
4. Migrate existing profiles to new structure

### Phase 3: Baseline Enhancement

1. Create baseline collection tooling
2. Build automated baseline generation pipeline
3. Add RPM-binned statistics
4. Implement rate-of-change detection

### Phase 4: Detection Logic Improvements

1. Move hard-coded values to configuration
2. Implement state-dependent thresholds
3. Add persistence/debounce logic
4. Improve outlier handling

---

## Appendix: Engine Parameter Reference

### Common Parameters by Category

**Engine Speed & Control**:
- `rpm`, `RPM_Gov`, `RPM_Dmd`, `TPS_pct`

**Temperatures**:
- `ECT` (Engine Coolant Temp)
- `OILT` (Oil Temperature)
- `IAT` (Intake Air Temp)
- `EGT_1`, `EGT_2` (Exhaust Gas Temps)

**Pressures**:
- `OILP_press` (Oil Pressure)
- `MAP` (Manifold Absolute Pressure)
- `Baro` (Barometric)
- `FuelP` (Fuel Pressure)

**Fuel Control**:
- `CL_BM1`, `CL_BM2` (Closed Loop Trims)
- `A_BM1`, `A_BM2` (Adaptive Trims)
- `EQR` (Equivalence Ratio)
- `spk_adv` (Spark Advance)

**Electrical**:
- `Vbat` (Battery Voltage)
- `Alt_V` (Alternator Voltage)

**Sensors**:
- `O2_pre`, `O2_post` (Oxygen Sensors)
- `knock_1`, `knock_2` (Knock Sensors)

---

## Contact & Support

**Repository Owner**: Eric Fowler (ericfowler-dev)
**Organization**: Power Solutions International (PSI)
**Department**: Customer Care / Service & Warranty

---

*Document Version: 1.0*
*Last Updated: January 2026*
*For Claude Code Sub-Agent Use*
