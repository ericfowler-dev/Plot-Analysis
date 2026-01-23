# Baseline Guide Review (Jan 2026)

Source guide: `example_files/Baseline/BASELINE_GUIDE_22JA.md`

## Summary
- Reviewed the guide against the current Config_v3.0 branch state.
- Several items in the guide are now **resolved** by recent Config_v3.0 changes (engine-state unification, invalid sample handling, profile cycle protection, UI mapping).
- Baseline integration into detection **remains not implemented**, and RPM-binned baselines are **still out-of-band** (only present in the FULL export file).
- The PSI Industrial 5.7L Power Systems baseline data **has been merged** into `server/data/baselines/good_baseline.json` using the compatible JSON file.

## Items Already Resolved (by Config_v3.0 changes)

### 1) Shared Engine State Module
**Guide ask:** centralize engine state logic.
**Current state:** ✅ Implemented.
- Shared tracker + constants live in `src/lib/engineState.js`.
- Both `anomalyEngine.js` and `bplotParsers.js` now consume the shared module.

### 2) Invalid Samples Should Not Coerce to Zero
**Guide ask:** null (not zero) for invalid samples; allow dropout detection / skip nulls.
**Current state:** ✅ Implemented.
- `bplotParsers.js` now stores invalid cells as `null`.
- Stats and rule evaluation skip non-finite values, reducing false positives.

### 3) Profile Inheritance Cycle Protection
**Guide ask:** detect cyclic inheritance.
**Current state:** ✅ Implemented.
- `server/utils/profileLoader.js` now guards against circular `parent` chains.

### 4) Config 3.0 Mapping Layer
**Guide ask:** unify/bridge UI config and runtime schema.
**Current state:** ✅ Implemented as a mapping layer.
- Config 3 editor now maps UI-only fields to existing runtime thresholds on save/export/preview.

## Items Still Open / Not Yet Implemented

### A) Baseline Integration Into Detection
**Guide ask:** pass baseline bounds into `detectAnomalies()` and evaluate p05/p95.
**Current state:** ❌ Not implemented.
- `detectAnomalies()` still only consumes profile thresholds and rules.
- Baselines remain UI-only and out-of-band.

### B) RPM-Binned Baselines
**Guide ask:** use RPM-binned stats for state-aware checks.
**Current state:** ❌ Not implemented.
- RPM-binned stats exist in `5.7L_PSI_Industrial_PowerSystems_baseline_FULL.json` only.
- The active baseline store uses the **non-binned** compatibility JSON.

### C) Configurator Hierarchy Alignment (Group → Size → Application)
**Guide ask:** unify profile hierarchy with baseline hierarchy.
**Current state:** ❌ Not implemented.
- Profiles still use `parent` chaining; no formal `classification` object.

### D) Hard-coded engine “running” threshold (rpm > 400)
**Guide ask:** move to profile or config.
**Current state:** ❌ Not implemented.
- `isEngineRunning()` in `anomalyEngine.js` still uses a hard-coded 400 RPM check.

## PSI Industrial 5.7L Baseline Data Integration

### What was added
- Source data: `example_files/Baseline/PSI Industrial 5.7L Power Systems/5.7L_PSI_Industrial_PowerSystems_baseline.json`
- Merged into: `server/data/baselines/good_baseline.json`
- Index updated: `server/data/baselines/_index.json` (timestamp refreshed)

### What’s included
- 36 parameters with p05/p95 + padding, 10 files, 191,815 samples (per review doc).
- Min-padding map extended with CL_BM1, A_BM1, spk_adv, PWe_avg.

### What’s not included (yet)
- RPM-binned statistics (present only in `_FULL.json`).
- Any detection logic using these baselines.

## Notes About the Guide vs Current Code
- The guide references `engineState.js` and `SignalQualityAnalyzer` behavior, which now align with the shared engine state and null-handling changes.
- The baseline UI still exists but is not wired into anomaly detection, which the guide correctly identifies as the biggest remaining gap.

## Suggested Next Steps (Optional)
1. Decide whether to integrate baseline bounds into detection (low-severity informational alerts vs warnings).
2. If yes, define how RPM-binned baselines should override global bounds.
3. Decide whether to formalize `classification` in profile schema to mirror baseline hierarchy.

---

If you want, I can also wire baseline bounds into `detectAnomalies()` in a low-risk way (info-only alerts, toggleable), and optionally ingest RPM-binned baselines from the FULL JSON.
