# Config 3.0 Review (Config 3.0 UI vs Existing Schema)

Date: 2026-01-22  
Scope: Review of `CONFIG_3.0_CHANGELOG.md` and the Config 3.0 UI implementation, with a focus on mapping the UI to the **existing** anomaly-engine schema.  
User decisions: **UI mapping to existing schema**, **remove Signal Quality from Thresholds grid**, **Signals-only**, **drop BPLT support claim**.

---

## Findings (ordered by severity)

1) **Critical – Most new parameters are not evaluated by the anomaly engine**  
The Config 3.0 catalog introduces many parameters (oil temp, IAT, fuel trim per bank, knock count, etc.), but `detectAnomalies` only reads a small subset (`battery`, `coolantTemp`, `oilPressure`, `rpm`, `fuelTrim`, `knock`, `signalQuality`). All other cards are effectively no-ops.  
- `src/lib/parameterCatalog.js:149`  
- `src/lib/parameterCatalog.js:351`  
- `src/lib/parameterCatalog.js:622`  
- `src/lib/anomalyEngine.js:1215`  
- `src/lib/anomalyEngine.js:1240`  
- `src/lib/anomalyEngine.js:1245`

2) **High – Signal Quality edits are overwritten**  
`signalQuality` is editable in the Thresholds grid (via `PARAMETER_CATALOG`) and separately in the Signals section, but save logic overwrites the Thresholds entry with the Signals state. Grid edits are lost.  
- `src/lib/parameterCatalog.js:786`  
- `src/components/admin/ParameterGrid.jsx:164`  
- `src/components/admin/Config3Editor.jsx:481`  
- `src/components/admin/Config3Editor.jsx:506`

3) **High – Unsaved changes are flagged immediately**  
The current `useEffect` flips `hasChanges` to true on mount, enabling Save and incrementing profile version even with no user edits.  
- `src/components/admin/Config3Editor.jsx:491`  
- `src/components/admin/ThresholdManager.jsx:205`

4) **Medium – Raw JSON editor doesn’t update `thresholds` / `anomalyRules` state**  
Raw JSON updates only `profile`, but `save` uses separate `thresholds` and `anomalyRules` state, so edits made in the Raw JSON section can be ignored on Save.  
- `src/components/admin/Config3Editor.jsx:447`  
- `src/components/admin/Config3Editor.jsx:499`

5) **Medium – Sidebar category selection can become stale**  
`ParameterGrid` initializes `activeCategory` from props once and won’t update when `filterCategory` changes (e.g., switching sidebar categories).  
- `src/components/admin/ParameterGrid.jsx:160`

6) **Medium – “Enabled count” is inaccurate when a profile omits explicit entries**  
Count uses `thresholds[paramId]` and treats undefined as disabled, even though defaults may be enabled.  
- `src/components/admin/ParameterGrid.jsx:208`

7) **Medium – Save does not enforce validation**  
The UI has a Validate button, but Save doesn’t call it. Invalid configs can be saved without warning.  
- `src/components/admin/ConfiguratorLayout.jsx:387`  
- `src/components/admin/Config3Editor.jsx:499`  
- `src/components/admin/Config3Editor.jsx:521`

8) **Medium – Preview claims BPLT support but only parses CSV**  
The dropzone accepts `.bplt`, but the parser is CSV‑only. Users will see errors or mis-reads.  
- `src/components/admin/ThresholdPreview.jsx:61`  
- `src/components/admin/ThresholdPreview.jsx:83`  
- `src/components/admin/ThresholdPreview.jsx:338`

9) **Low – Preview default parameter may be missing from file**  
`selectedParam` defaults to `coolantTemp` even when the file doesn’t have that column.  
- `src/components/admin/ThresholdPreview.jsx:327`

10) **Low – Validation is incomplete**  
Only warning vs critical ordering is checked; it doesn’t validate min<max within each tier or value bounds.  
- `src/components/admin/ParameterGrid.jsx:268`

---

## Required Direction (based on user decisions)

1) **Map the UI to the existing schema**  
This means the UI must only expose parameters the engine already evaluates or must translate UI values into the existing schema on save.

2) **Remove Signal Quality from Thresholds grid; keep it Signals-only**  
Signal quality should not be listed alongside threshold cards.

3) **Drop BPLT support claim from Preview**  
Until a BPLT parser is actually implemented, the UI should not claim BPLT support.

---

## Proposed Schema Mapping (UI → existing anomaly engine)

### Already aligned (keep as-is)
- `battery` → `thresholds.battery`
- `coolantTemp` → `thresholds.coolantTemp`
- `oilPressure` → `thresholds.oilPressure`
- `rpm` → `thresholds.rpm`
- `signalQuality` → `thresholds.signalQuality` *(Signals-only UI)*

### Requires mapping or consolidation

**Fuel Trim (current UI: per‑bank, per‑mode) → existing `thresholds.fuelTrim`**
- Existing engine expects:  
  - `thresholds.fuelTrim.closedLoop.warning.min/max`  
  - `thresholds.fuelTrim.closedLoop.critical.min/max`  
  - `thresholds.fuelTrim.adaptive.warning.min/max`  
  - `thresholds.fuelTrim.adaptive.critical.min/max`  
- Current UI exposes:  
  - `closedLoopTrimBank1` (+ Bank2)  
  - `adaptiveTrimBank1` (+ Bank2)
- Suggested UI mapping (simplest):  
  - Use a **single Fuel Trim card** that edits `fuelTrim.closedLoop` and `fuelTrim.adaptive`.  
  - Hide/omit the per‑bank cards unless you plan to extend the engine.

**Knock (current UI: multiple metrics) → existing `thresholds.knock`**
- Existing engine uses `thresholds.knock.maxRetard.warning/critical` and likely `percentageThreshold`.  
- Current UI exposes `knockRetard`, `knockCount`, `knockPercentage`.  
- Suggested UI mapping (simplest):  
  - Keep **one Knock card** wired to `knock.maxRetard` and `knock.percentageThreshold`.  
  - Hide or demote `knockCount` / `knockPercentage` unless engine support is added.

**Everything else**
If you must keep the additional parameters visible, add a **translation layer** in `onSave` that either:
- Maps them into existing schema (if possible), or
- Persists them under `thresholds.metadata` (non‑functional) with a clear “Not evaluated” label in UI.

---

## Signals‑only change (Signal Quality)

Implement:
- **Exclude `signalQuality` from ParameterGrid** (or exclude the whole `signals` category).
- Keep only the Signals section to edit `thresholds.signalQuality`.

Rationale:
Avoid conflicting edits and ensure there’s one source of truth for dropout rules.

---

## “Drop it” (BPLT support claim)

If no BPLT parser is available, remove `.bplt` from the file accept list and UI copy:
- Accept should be `.csv` only.
- Copy should say “Supports CSV files”.

---

## Additional Recommendations (non-blocking)

1) **Fix `hasChanges` tracking**  
Set it true only after user edits (not on mount).

2) **Sync Raw JSON editor with thresholds/rules**  
When Raw JSON changes, split values into `profile`, `thresholds`, `anomalyRules`, and `signalQuality` state.

3) **Auto-validate on Save**  
Run `handleValidate()` before save and block if errors exist.

4) **Keep category filter in sync with sidebar**  
When `filterCategory` prop changes, update `activeCategory`.

5) **Fix enabled counts**  
Count enabled state from merged config (thresholds + defaults), not thresholds alone.

---

## Summary of Proposed User‑Directed Changes

- Map Config 3.0 UI to existing anomaly-engine schema.  
- Keep Signal Quality in Signals-only section (no Thresholds grid entry).  
- Drop BPLT support claim in Preview until a parser exists.

