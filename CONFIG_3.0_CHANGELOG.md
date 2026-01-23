# Config 3.0 Threshold Configurator - Implementation Changelog

**Branch:** `Config_v2.0`
**Date:** 2026-01-21
**Author:** Claude Opus 4.5

---

## Overview

Complete redesign of the threshold configurator admin interface with the following goals:
- Easier to use with modern UI patterns
- Many more configuration options (40+ parameters)
- Significantly improved GUI with visual editing
- Extensible architecture driven by parameter catalog

---

## New Files Created

### 1. `src/lib/parameterCatalog.js` (~700 lines)

**Purpose:** Centralized parameter definitions that drive UI generation

**Key Exports:**
- `PARAMETER_CATALOG` - Object containing 40+ parameter definitions
- `PARAMETER_CATEGORIES` - Category metadata (name, color, icon, description)
- `THRESHOLD_TYPES` - Enum for threshold types (RANGE, MAX_ONLY, MIN_ONLY, CUSTOM)
- `getDefaultThresholds(parameterId)` - Get default values for a parameter
- `getParametersByCategory(categoryId)` - Filter parameters by category
- `searchParameters(query)` - Search parameters by name/description
- `supportsHysteresis(parameterId)` - Check if parameter supports hysteresis
- `supportsConditions(parameterId)` - Check if parameter supports ignoreWhen/requireWhen

**Parameter Categories:**
| Category | Parameters | Examples |
|----------|------------|----------|
| electrical | 4 | Battery Voltage, Switch Voltage, Alternator, Starter Current |
| thermal | 6 | Coolant Temp, Oil Temp, IAT, EGT, Intercooler, Catalyst |
| pressure | 6 | Oil Pressure, MAP, TIP, Fuel Pressure, Crankcase, Boost |
| fuel | 5 | Closed Loop Trim, Adaptive Trim, Lambda/AFR, Injector Duty, VE |
| engine | 5 | RPM, Engine Load, Throttle Position, Spark Advance, Governor |
| knock | 3 | Knock Retard, Knock Counts, Knock Percentage |
| mfg | 5 | MFG Delta Pressure, US/DS Pressure, TPS Actual/Command |
| signals | 1 | Signal Quality (per-channel dropout detection) |

**Parameter Definition Structure:**
```javascript
{
  id: 'battery',
  name: 'Battery Voltage',
  category: 'electrical',
  unit: 'V',
  description: 'System battery/alternator voltage monitoring',
  dataColumns: ['Vbat', 'battery_voltage', 'VBAT', 'vbat'],
  thresholdType: THRESHOLD_TYPES.RANGE,
  defaults: {
    enabled: true,
    warning: { min: 11.5, max: 30 },
    critical: { min: 10.5, max: 32 }
  },
  validation: { min: 0, max: 50, step: 0.1 },
  advanced: ['hysteresis', 'ignoreWhen', 'requireWhen'],
  engineFamilies: null  // null = all families
}
```

---

### 2. `src/components/admin/ConfiguratorLayout.jsx` (~350 lines)

**Purpose:** Main layout container with collapsible sidebar navigation

**Features:**
- Collapsible sidebar with section icons
- Navigation sections: Overview, Thresholds (with category subsections), Rules, Signals, Preview, Advanced
- Header with profile name, Save button, Validate button
- Breadcrumb trail showing current section
- Tracks unsaved changes state
- Responsive design

**Props:**
```javascript
{
  profileName: string,
  children: ReactNode,
  activeSection: string,
  onSectionChange: (sectionId) => void,
  onSave: () => void,
  onBack: () => void,
  hasUnsavedChanges: boolean,
  validationErrors: string[]
}
```

---

### 3. `src/components/admin/ThresholdCard.jsx` (~400 lines)

**Purpose:** Individual parameter configuration card with visual threshold editing

**Features:**
- Enable/disable toggle for each parameter
- Visual range slider with warning/critical zone highlighting
- Color-coded zones (green=normal, yellow=warning, red=critical)
- Inline value inputs with validation
- Expandable advanced settings section
- Reset to defaults button
- Validation error display

**Advanced Settings (when expanded):**
- Hysteresis values (low clear, high clear)
- RPM-dependent thresholds toggle
- Persistence timing (trigger, clear seconds)
- Ignore When conditions
- Require When conditions

**Props:**
```javascript
{
  parameter: object,      // From PARAMETER_CATALOG
  config: object,         // Current threshold config
  onChange: (config) => void,
  onReset: () => void,
  validation: { errors: string[] }
}
```

---

### 4. `src/components/admin/ParameterGrid.jsx` (~250 lines)

**Purpose:** Searchable grid of ThresholdCards with category filtering

**Features:**
- Search bar with clear button
- Category filter tabs (All, Electrical, Thermal, etc.)
- Quick actions toolbar: Enable All, Disable All, Reset All
- Parameter count display (X of Y enabled)
- Groups parameters by category with headers
- Empty state when no matches
- Configurable column count (1, 2, or 3)

**Sub-components:**
- `SearchBar` - Text input with search icon
- `CategoryTabs` - Horizontal tab buttons with color indicators
- `QuickActions` - Bulk operation buttons
- `EmptyState` - No results message

**Props:**
```javascript
{
  thresholds: object,
  onChange: (thresholds) => void,
  engineFamily: string | null,
  filterCategory: string | null,
  showSearch: boolean,
  showCategoryTabs: boolean,
  showQuickActions: boolean,
  columns: 1 | 2 | 3
}
```

**Also exports:** `CategoryParameterGrid` - Pre-configured for single category view

---

### 5. `src/components/admin/RuleBuilder.jsx` (~500 lines)

**Purpose:** Visual anomaly rule editor with drag-and-drop conditions

**Features:**
- Rule list with enable/disable toggles
- Add new rule button
- Rule card with expandable details
- Condition blocks with parameter selection
- Engine state predicate support (EngineRunning, EngineStable, etc.)
- Logic connector selector (AND/OR)
- Timing configuration panel
- Ignore When / Require When sections
- Delete rule with confirmation

**Supported Engine State Predicates:**
- `EngineRunning` - RPM > 500
- `EngineStable` - RPM > 800 for 2+ seconds
- `EngineStarting` - Cranking or warmup phase
- `EngineStopping` - Engine shutting down
- `KeyOn` - Vsw > 1V
- `FuelEnabled` - Fuel system active

**Timing Configuration:**
- Trigger Persistence (seconds)
- Clear Persistence (seconds)
- Start Delay (seconds)
- Stop Delay (seconds)
- Window (seconds) - for time-accumulation mode

**Props:**
```javascript
{
  rules: array,
  onChange: (rules) => void
}
```

---

### 6. `src/components/admin/ThresholdPreview.jsx` (~400 lines)

**Purpose:** File upload and threshold preview with anomaly detection visualization

**Features:**
- Drag-and-drop file upload zone
- Supports CSV and BPLT files
- Runs `detectAnomalies()` on uploaded data
- Summary statistics cards (total alerts, critical, warning, info)
- Parameter selector for chart view
- Mini time-series chart with threshold lines
- Alert list with severity badges and timestamps
- Clear file button

**Sub-components:**
- `FileDropzone` - Drag/drop upload area
- `SummaryCards` - Alert count cards
- `MiniChart` - Simple SVG line chart with threshold visualization
- `AlertList` - Scrollable list of detected alerts

**Props:**
```javascript
{
  thresholds: object,
  anomalyRules: array
}
```

---

### 7. `src/components/admin/Config3Editor.jsx` (~500 lines)

**Purpose:** Main editor component combining all section components

**Features:**
- Profile state management (name, description, thresholds, rules)
- Section routing based on sidebar selection
- Auto-save detection (tracks unsaved changes)
- Validation before save
- Profile overview with category summaries
- Signal quality editor with per-channel config
- Advanced settings with raw JSON editor
- Combines all sub-components into cohesive experience

**Sections:**
1. **Overview** - Profile info, category summaries, quick stats
2. **Thresholds** - ParameterGrid (all or by category)
3. **Rules** - RuleBuilder for anomaly rules
4. **Signals** - Per-channel signal quality configuration
5. **Preview** - ThresholdPreview with file upload
6. **Advanced** - Raw JSON editing, metadata

**Props:**
```javascript
{
  profile: object,        // Initial profile data
  onSave: (profile) => void,
  onBack: () => void
}
```

---

## Modified Files

### `src/components/admin/ThresholdManager.jsx`

**Changes:**

1. **Added imports:**
```javascript
import Config3Editor from './Config3Editor';
import { Sparkles } from 'lucide-react';
```

2. **Added state for editor toggle:**
```javascript
const [useConfig3, setUseConfig3] = useState(true); // Default to new editor
```

3. **Modified render logic** (around line 349):
```javascript
if (editingProfile) {
  if (useConfig3) {
    return (
      <div className="fixed inset-0 bg-gray-100 z-50">
        <Config3Editor
          profile={editingProfile}
          onSave={handleSaveProfile}
          onBack={() => setEditingProfile(null)}
        />
      </div>
    );
  }
  // Legacy editor fallback
  return <ThresholdEditor ... />;
}
```

4. **Added toggle button in header** (around line 412):
```javascript
<button
  onClick={() => setUseConfig3(!useConfig3)}
  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
    useConfig3
      ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
  }`}
  title={useConfig3 ? 'Using Config 3.0 (New)' : 'Using Legacy Editor'}
>
  <Sparkles className="w-4 h-4" />
  {useConfig3 ? 'Config 3.0' : 'Legacy'}
</button>
```

---

## Architecture Decisions

### 1. Parameter Catalog Pattern

Instead of hardcoding threshold fields in the UI, all parameters are defined in a central catalog. This enables:
- Adding new parameters without changing UI code
- Consistent validation across all parameters
- Easy filtering by category or engine family
- Searchable parameter list
- Reusable default values

### 2. Component Composition

The editor is composed of independent, reusable components:
```
Config3Editor
├── ConfiguratorLayout (shell)
│   ├── Sidebar (navigation)
│   └── Content Area
│       ├── ProfileOverview
│       ├── ParameterGrid
│       │   └── ThresholdCard (×N)
│       ├── RuleBuilder
│       │   └── RuleCard (×N)
│       ├── SignalQualityEditor
│       ├── ThresholdPreview
│       └── AdvancedSettings
```

### 3. Backward Compatibility

- Legacy `ThresholdEditor` is preserved and accessible via toggle
- Profile JSON schema is unchanged
- Existing profiles work without modification
- API routes unchanged

### 4. State Management

- Local state within `Config3Editor` for editing
- Changes tracked for unsaved indicator
- Validation runs on save attempt
- Parent component (`ThresholdManager`) handles persistence

---

## Testing Checklist

- [ ] Start dev server (`npm run dev`)
- [ ] Navigate to Threshold Manager
- [ ] Click Edit on any profile
- [ ] Verify Config 3.0 editor opens by default
- [ ] Test sidebar navigation (all sections)
- [ ] Test parameter search functionality
- [ ] Test category filter tabs
- [ ] Test threshold card enable/disable toggle
- [ ] Test threshold slider interaction
- [ ] Test advanced settings expansion
- [ ] Test rule builder - add/edit/delete rules
- [ ] Test file upload in Preview section
- [ ] Test Save button functionality
- [ ] Test toggle to Legacy editor and back
- [ ] Verify build passes (`npm run build`)
- [ ] Verify lint clean (`npm run lint`)

---

## Known Limitations

1. **Theme Mismatch** - Config 3.0 uses light theme with blue accents, while main app uses dark cyberpunk theme with green accents. May want to update styling for consistency.

2. **No Profile Wizard** - Plan mentioned ProfileWizard for guided creation, not yet implemented.

3. **No Bulk Operations Panel** - Plan mentioned BulkOperations component, not yet implemented.

4. **No Server-side Catalog API** - Catalog is client-side only; plan mentioned `/api/thresholds/catalog` endpoint.

5. **Preview Chart is Basic** - Uses simple SVG; could be enhanced with Recharts like rest of app.

---

## File Summary

| File | Lines | Status |
|------|-------|--------|
| `src/lib/parameterCatalog.js` | ~700 | New |
| `src/components/admin/ConfiguratorLayout.jsx` | ~350 | New |
| `src/components/admin/ThresholdCard.jsx` | ~400 | New |
| `src/components/admin/ParameterGrid.jsx` | ~250 | New |
| `src/components/admin/RuleBuilder.jsx` | ~500 | New |
| `src/components/admin/ThresholdPreview.jsx` | ~400 | New |
| `src/components/admin/Config3Editor.jsx` | ~500 | New |
| `src/components/admin/ThresholdManager.jsx` | ~900 | Modified |

**Total new code:** ~3,100 lines across 7 new files

---

## Build Verification

```
npm run build
✓ 2617 modules transformed
✓ built in 12.17s

npm run lint (Config 3.0 files only)
No lint errors in new Config 3.0 files
```
