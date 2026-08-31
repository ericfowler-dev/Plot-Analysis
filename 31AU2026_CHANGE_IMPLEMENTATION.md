# 31 August 2026 Change Request Implementation

## Implemented behavior

- Engine-hour counters are read through one shared utility. `HM_RAM_seconds` is treated as the hours-valued counter used by the supplied BPLT files, and start/end values retain two decimal places.
- Dual-plot overlays automatically correlate shared signals and shift the Secondary timeline to the Primary event timeline. The supplied plots resolve to a `+17.5s` Secondary shift. A manual adjustment is available beside the chart appearance controls.
- Alert cards and chart annotations use the diagnostic alert name instead of inferring the name from the category/channel. Fuel-trim alerts explicitly identify `CL_BM1`.
- MFG delta-pressure rules for the 40L/53L MFG profile are non-overlapping:
  - warning: `0.4 <= MFG_DPPress < 0.6` for 5 seconds while `EngineStable == 1`;
  - critical: `MFG_DPPress < 0.4` for 2 seconds while `EngineStable == 1`.
- The prior "upstream pressure dropping" rule is disabled because it tested a static delta-pressure threshold rather than an upstream-pressure trend and duplicated the new warning.
- Global TPS load-limit rules use percentage-point difference (`LoadLim_max_TPS - TPS_pct`):
  - warning: difference greater than 1 and at most 5 for 5 stable seconds;
  - critical: difference at most 1 (including limit exceedance) for 2 stable seconds.
- Chart axes can be reassigned per channel to automatic unit axes or shared Manual A/B/C axes. Every active axis accepts optional minimum and maximum values.

## Configuration and detection corrections

- Resolved profiles now retain inherited metadata, engine-state config, validity config, and diagnostic guidance.
- BPLT statistics and anomaly detection use the resolved per-profile engine-state thresholds.
- Stable engine state exits back to unstable after RPM remains below the stable hysteresis band.
- A rule's legacy `duration` is now trigger persistence when `triggerPersistenceSec` is not present.
- Server and Config 3 validation reject malformed conditions, duplicate rule IDs, unsupported operators, negative timing, and invalid engine-state predicates such as `EngineStable >= 800`.
- The duplicate `engineLoad` parameter-catalog entry was removed.
- The truncated `psi-hd-22l-powersystems.json` file was restored as a valid child profile. Because no original override body exists in Git, it currently inherits PSI HD base thresholds without local overrides.

## Verification

- Supplied BPLT counters: Primary `1.50h -> 2.18h`; Secondary `1.50h -> 2.18h` after display rounding.
- Supplied BPLT signal correlation: Secondary shift `+17.5s`, approximately `99.8%` confidence.
- Synthetic rule evaluation confirms warning/critical severity bands do not overlap and explicit channels are retained.
- `npm test`: 7 tests passing.
- `npm run build`: successful.

## Follow-up options

- Implement a true time-windowed upstream-pressure trend rule before re-enabling `mfg-upstream-pressure-dropping`.
- Split the main client bundle; the production build still reports a pre-existing large-chunk warning (approximately 1.56 MB before gzip).
- Address the repository-wide pre-existing ESLint backlog separately; it is broader than this change set.
