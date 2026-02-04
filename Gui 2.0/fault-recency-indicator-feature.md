# Feature Request: Fault Recency Visual Indicators

## Overview

Add visual indicators to the **Fault Snapshot Data** section on the ECM Overview page that immediately communicate whether fault codes are current, recent, or historical based on comparison with engine hours.

---

## Current State

The Fault Snapshot Data section displays fault codes (DTCs) with a `Last @ Hours` value, but users must manually compare this against the `Engine Hours` value (displayed at top of page) to determine fault recency. This requires mental math and is easy to miss during quick analysis.

**Current UI Elements:**
- Engine Hours: `641.8 h` (top of page)
- Fault entries show: DTC code, description, count, and `Last @ Hours` value
- Existing visual: Flashing/glowing `SHUTDOWN` badge (red with glow animation)

---

## Requested Feature

### Recency Classification Logic

Compare each fault's `Last @ Hours` value against current `Engine Hours`:

| Classification | Condition | Visual Treatment |
|----------------|-----------|------------------|
| **CURRENT** | `Engine Hours - Last @ Hours ≤ 2` | Flashing/glowing **RED** border |
| **RECENT** | `Engine Hours - Last @ Hours ≤ 50` | Flashing/glowing **YELLOW** border |
| **HISTORICAL** | `Engine Hours - Last @ Hours > 50` | No special indicator (default state) |

### Visual Implementation

#### Border Animation Style
Match the existing `SHUTDOWN` badge animation style for consistency:
- Smooth pulsing glow effect
- Animation should be noticeable but not distracting
- Glow should emanate from the border

#### Suggested CSS Animation Approach

```css
/* CURRENT fault - Red flashing/glowing border */
.fault-item.current {
  border: 2px solid #ff4444;
  animation: glow-red 1.5s ease-in-out infinite;
}

@keyframes glow-red {
  0%, 100% {
    box-shadow: 0 0 5px #ff4444, 0 0 10px #ff4444, 0 0 15px #ff4444;
  }
  50% {
    box-shadow: 0 0 10px #ff4444, 0 0 20px #ff4444, 0 0 30px #ff4444;
  }
}

/* RECENT fault - Yellow flashing/glowing border */
.fault-item.recent {
  border: 2px solid #ffcc00;
  animation: glow-yellow 1.5s ease-in-out infinite;
}

@keyframes glow-yellow {
  0%, 100% {
    box-shadow: 0 0 5px #ffcc00, 0 0 10px #ffcc00, 0 0 15px #ffcc00;
  }
  50% {
    box-shadow: 0 0 10px #ffcc00, 0 0 20px #ffcc00, 0 0 30px #ffcc00;
  }
}

/* HISTORICAL fault - Default styling, no animation */
.fault-item.historical {
  border: 1px solid rgba(255, 255, 255, 0.2);
  /* No animation */
}
```

---

## Implementation Details

### Calculation Logic (Pseudocode)

```javascript
function getFaultRecencyClass(engineHours, lastAtHours) {
  const hoursDelta = engineHours - lastAtHours;
  
  if (hoursDelta <= 2) {
    return 'current';  // RED indicator
  } else if (hoursDelta <= 50) {
    return 'recent';   // YELLOW indicator
  } else {
    return 'historical'; // No indicator
  }
}
```

### Apply to Each Fault Entry

For each fault in the Fault Snapshot Data list:
1. Get current `Engine Hours` from ECM data (e.g., `641.8`)
2. Get fault's `Last @ Hours` value (e.g., `637.88h` for DTC 1326)
3. Calculate delta: `641.8 - 637.88 = 3.92 hours`
4. Apply appropriate CSS class based on classification

### Example with Current Screenshot Data

| DTC | Last @ Hours | Delta from 641.8h | Classification |
|-----|--------------|-------------------|----------------|
| 1172 | 24.97h | 616.83h | HISTORICAL (no indicator) |
| 1326 | 637.88h | 3.92h | RECENT (yellow glow) |

---

## UI Mockup Description

### Fault Snapshot Data Section

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠ Fault Snapshot Data                    1 Shutdown  2 Total│
│ 2 FAULTS RECORDED                                           │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ DTC 1172                              ⚡ SHUTDOWN       │ │
│ │ EPR / CFV regulation pressure lower than expected       │ │
│ │ Count: 2  Last: 24.97h                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                        ↑ No border glow (HISTORICAL)        │
│                                                             │
│ ╔═══════════════════════════════════════════════════════╗   │
│ ║ DTC 1326                               ~~~YELLOW~~~   ║   │
│ ║ Knock retard above threshold                          ║   │
│ ║ Count: 6  Last: 637.88h                               ║   │
│ ╚═══════════════════════════════════════════════════════╝   │
│                 ↑ Yellow glowing border (RECENT: 3.92h ago) │
└─────────────────────────────────────────────────────────────┘
```

If DTC 1326's `Last @ Hours` were `640.5h` (within 2 hours of 641.8h):
- Border would be **RED** with red glow animation
- Classification: **CURRENT**

---

## Optional Enhancements

### 1. Tooltip/Label Badge
Add a small badge showing recency status:
- `CURRENT` (red badge)
- `RECENT` (yellow badge)
- Position near the `Last @ Hours` value

### 2. Summary Counter
In the section header, add counts:
```
⚠ Fault Snapshot Data          1 Current  0 Recent  1 Shutdown  2 Total
```

### 3. Configurable Thresholds
Allow users to adjust the 2-hour and 50-hour thresholds via settings.

### 4. Sort by Recency
Option to auto-sort fault list with CURRENT faults at top, then RECENT, then HISTORICAL.

---

## Acceptance Criteria

- [ ] Faults with `Last @ Hours` within 2 hours of `Engine Hours` display red glowing border
- [ ] Faults with `Last @ Hours` within 50 hours of `Engine Hours` display yellow glowing border  
- [ ] Faults older than 50 hours show no special indicator
- [ ] Animation style matches existing `SHUTDOWN` badge glow effect
- [ ] Recency is recalculated when new data is loaded
- [ ] Performance: Animation should not cause UI lag with multiple faults

---

## Technical Notes

- Reference existing `SHUTDOWN` badge CSS for animation timing and glow intensity
- Ensure accessibility: consider `prefers-reduced-motion` media query to disable animations for users who need it
- Test with edge cases: exactly 2.0 hours, exactly 50.0 hours, 0 hours delta

---

## Priority

**HIGH** - This is a safety/diagnostic visibility improvement that helps technicians quickly identify active issues.
