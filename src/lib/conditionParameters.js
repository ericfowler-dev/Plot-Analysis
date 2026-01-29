import { ENGINE_STATE_PREDICATE_OPTIONS } from './anomalyEngine.js';
import { BPLOT_PARAMETERS } from './bplotThresholds.js';

const PARAMETER_ALIASES = {
  RPM: 'rpm',
  HM_RAM_seconds: 'HM_RAM',
  Gov1_rpm: 'gov1_rpm',
  Gov2_rpm: 'gov2_rpm',
  Gov3_rpm: 'gov3_rpm'
};

const createSignalOptions = () => {
  const canonicalOptions = new Map();

  for (const [key, info] of Object.entries(BPLOT_PARAMETERS)) {
    const canonicalKey = PARAMETER_ALIASES[key] || key;
    if (canonicalOptions.has(canonicalKey)) {
      continue;
    }

    canonicalOptions.set(canonicalKey, {
      key: canonicalKey,
      canonicalKey,
      label: info?.name || key,
      unit: info?.unit || '',
      description: info?.description || '',
      category: 'signal'
    });
  }

  return Array.from(canonicalOptions.values()).sort((a, b) => a.label.localeCompare(b.label));
};

const SIGNAL_PARAMETER_OPTIONS = createSignalOptions();

const ENGINE_STATE_OPTIONS = ENGINE_STATE_PREDICATE_OPTIONS.map(opt => ({
  key: opt.key,
  canonicalKey: opt.key,
  label: opt.label,
  unit: '',
  description: opt.description,
  category: 'engine_state'
}));

const PARAMETER_OPTIONS = [...SIGNAL_PARAMETER_OPTIONS];
const ALL_CONDITION_OPTIONS = [...ENGINE_STATE_OPTIONS, ...SIGNAL_PARAMETER_OPTIONS];

const PARAMETER_LOOKUP = (() => {
  const lookup = new Map(PARAMETER_OPTIONS.map(option => [option.key, option]));
  for (const [key] of Object.entries(BPLOT_PARAMETERS)) {
    const canonicalKey = PARAMETER_ALIASES[key] || key;
    const option = lookup.get(canonicalKey);
    if (option) {
      lookup.set(key, option);
    }
  }
  return lookup;
})();

const ALL_CONDITION_LOOKUP = (() => {
  const lookup = new Map(ALL_CONDITION_OPTIONS.map(option => [option.key, option]));
  for (const [key] of Object.entries(BPLOT_PARAMETERS)) {
    const canonicalKey = PARAMETER_ALIASES[key] || key;
    const option = lookup.get(canonicalKey);
    if (option) {
      lookup.set(key, option);
    }
  }
  return lookup;
})();

export const CONDITION_OPERATORS = ['>', '<', '>=', '<=', '==', '!='];

export function isEnginePredicate(param) {
  return ENGINE_STATE_OPTIONS.some(option => option.key === param);
}

export {
  SIGNAL_PARAMETER_OPTIONS,
  ENGINE_STATE_OPTIONS,
  PARAMETER_OPTIONS,
  ALL_CONDITION_OPTIONS,
  PARAMETER_LOOKUP,
  ALL_CONDITION_LOOKUP
};
