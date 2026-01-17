import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASELINE_DATA_PATH = path.join(__dirname, '../data/baselines/good_baseline.json');
const BASELINE_INDEX_PATH = path.join(__dirname, '../data/baselines/_index.json');

const DEFAULT_INDEX = {
  version: '1.0.0',
  lastUpdated: null,
  groups: [],
  sizes: [],
  applications: []
};

function normalizeName(value) {
  return String(value || '').trim();
}

function findEntry(list, matcher) {
  return list.find(item => matcher(item));
}

function buildIndexFromData(baselineData) {
  const index = { ...DEFAULT_INDEX, lastUpdated: new Date().toISOString() };
  if (!baselineData?.groups) return index;

  const groups = Object.keys(baselineData.groups);
  index.groups = groups.map(name => ({ name, archived: false }));

  const sizes = [];
  const applications = [];

  for (const groupName of groups) {
    const groupData = baselineData.groups[groupName] || {};
    for (const sizeName of Object.keys(groupData)) {
      sizes.push({ group: groupName, name: sizeName, archived: false });
      const sizeData = groupData[sizeName] || {};
      for (const appName of Object.keys(sizeData)) {
        applications.push({
          group: groupName,
          size: sizeName,
          name: appName,
          archived: false
        });
      }
    }
  }

  index.sizes = sizes;
  index.applications = applications;
  return index;
}

async function saveIndex(index) {
  const payload = JSON.stringify(index, null, 2);
  await fs.writeFile(BASELINE_INDEX_PATH, payload, 'utf8');
}

export async function loadBaselineData() {
  const raw = await fs.readFile(BASELINE_DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

export async function loadBaselineIndex() {
  if (!existsSync(BASELINE_INDEX_PATH)) {
    const data = await loadBaselineData();
    const index = buildIndexFromData(data);
    await saveIndex(index);
    return index;
  }

  const raw = await fs.readFile(BASELINE_INDEX_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    ...DEFAULT_INDEX,
    ...parsed,
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    sizes: Array.isArray(parsed.sizes) ? parsed.sizes : [],
    applications: Array.isArray(parsed.applications) ? parsed.applications : []
  };
}

export async function addBaselineGroup(name) {
  const normalized = normalizeName(name);
  if (!normalized) {
    throw new Error('Group name is required');
  }

  const index = await loadBaselineIndex();
  const exists = findEntry(index.groups, item => item.name.toLowerCase() === normalized.toLowerCase());
  if (exists) {
    if (exists.archived) {
      exists.archived = false;
      index.lastUpdated = new Date().toISOString();
      await saveIndex(index);
    }
    return index;
  }

  index.groups.push({ name: normalized, archived: false });
  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}

export async function addBaselineSize(groupName, sizeName) {
  const group = normalizeName(groupName);
  const size = normalizeName(sizeName);
  if (!group || !size) {
    throw new Error('Group and size are required');
  }

  let index = await loadBaselineIndex();
  index = await addBaselineGroup(group);

  const exists = findEntry(index.sizes, item =>
    item.group.toLowerCase() === group.toLowerCase() &&
    item.name.toLowerCase() === size.toLowerCase()
  );

  if (exists) {
    if (exists.archived) {
      exists.archived = false;
      index.lastUpdated = new Date().toISOString();
      await saveIndex(index);
    }
    return index;
  }

  index.sizes.push({ group, name: size, archived: false });
  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}

export async function addBaselineApplication(groupName, sizeName, appName) {
  const group = normalizeName(groupName);
  const size = normalizeName(sizeName);
  const app = normalizeName(appName);
  if (!group || !size || !app) {
    throw new Error('Group, size, and application are required');
  }

  let index = await loadBaselineIndex();
  index = await addBaselineSize(group, size);

  const exists = findEntry(index.applications, item =>
    item.group.toLowerCase() === group.toLowerCase() &&
    item.size.toLowerCase() === size.toLowerCase() &&
    item.name.toLowerCase() === app.toLowerCase()
  );

  if (exists) {
    if (exists.archived) {
      exists.archived = false;
      index.lastUpdated = new Date().toISOString();
      await saveIndex(index);
    }
    return index;
  }

  index.applications.push({ group, size, name: app, archived: false });
  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}

async function updateArchive(list, matcher, archived) {
  const entry = findEntry(list, matcher);
  if (!entry) {
    throw new Error('Entry not found');
  }
  entry.archived = Boolean(archived);
}

export async function setGroupArchived(groupName, archived) {
  const group = normalizeName(groupName);
  const index = await loadBaselineIndex();
  await updateArchive(index.groups, item => item.name.toLowerCase() === group.toLowerCase(), archived);
  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}

export async function setSizeArchived(groupName, sizeName, archived) {
  const group = normalizeName(groupName);
  const size = normalizeName(sizeName);
  const index = await loadBaselineIndex();
  await updateArchive(index.sizes, item =>
    item.group.toLowerCase() === group.toLowerCase() &&
    item.name.toLowerCase() === size.toLowerCase(),
    archived
  );
  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}

export async function setApplicationArchived(groupName, sizeName, appName, archived) {
  const group = normalizeName(groupName);
  const size = normalizeName(sizeName);
  const app = normalizeName(appName);
  const index = await loadBaselineIndex();
  await updateArchive(index.applications, item =>
    item.group.toLowerCase() === group.toLowerCase() &&
    item.size.toLowerCase() === size.toLowerCase() &&
    item.name.toLowerCase() === app.toLowerCase(),
    archived
  );
  index.lastUpdated = new Date().toISOString();
  await saveIndex(index);
  return index;
}
