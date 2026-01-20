import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '../data/configurator.json');

const DEFAULT_STATE = {
  version: 1,
  lastUpdated: null,
  audit: []
};

async function writeState(state) {
  const payload = JSON.stringify(state, null, 2);
  await fs.writeFile(CONFIG_PATH, payload, 'utf8');
}

export async function loadConfiguratorState() {
  if (!existsSync(CONFIG_PATH)) {
    await writeState(DEFAULT_STATE);
    return { ...DEFAULT_STATE };
  }

  const raw = await fs.readFile(CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    ...DEFAULT_STATE,
    ...parsed,
    audit: Array.isArray(parsed.audit) ? parsed.audit : []
  };
}

export async function recordConfiguratorChange({ actor = 'admin', action, details = {} }) {
  const state = await loadConfiguratorState();
  const currentVersion = Number.isFinite(state.version) ? state.version : parseInt(state.version, 10) || 0;
  const nextVersion = currentVersion + 1;
  const timestamp = new Date().toISOString();
  const entry = {
    version: nextVersion,
    timestamp,
    actor,
    action,
    details
  };

  const nextState = {
    ...state,
    version: nextVersion,
    lastUpdated: timestamp,
    audit: [...state.audit, entry]
  };

  await writeState(nextState);
  return nextState;
}
