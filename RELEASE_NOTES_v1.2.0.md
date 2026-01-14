# Release Notes v1.2.0

High-level summary of changes contributed by Claude Code vs Codex.

## Claude Code
- New Tron-style `AppHeader` with file-type-aware tabs and stream source badges.
- Multi-file ECM + BPLT support: unified timeline merge, combined view tabs, and file boundary markers.
- Fault snapshot overlay mapping for B-Plot charts.
- Threshold system foundation: profiles, admin UI, context, and anomaly engine plumbing.
- ECM dashboard refinements and UI wiring to the new header.
- Added fonts to `index.html` (Inter, Orbitron, Fira Code, Material Symbols).

## Codex (me)
- B-Plot grouping and labels aligned to Engine/Speed Control/Fuel/etc., including new Ignition and Electrical sections.
- Fixed RPM handling and runtime stats when engine is already running at capture start.
- Categorical/binary channel display in tooltips and channels tab (text mappings).
- Removed B-Plot health % badge and ECM “Total Operating Time” card.
- Added “Snapshot data Hours” display from fault snapshot Hour Meter.
- Added flashing/glowing shutdown badges and threshold-triggered flashing borders for Knock/Backfire cards.
- Tooltip precision for overview chart (1 decimal) and hidden threshold settings button.
- Version bump in header to `v1.2.0`.
