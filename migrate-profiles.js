import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from './server/db/pool.js';
import { ensureProfilesTables } from './server/db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROFILES_DIR = path.join(__dirname, 'server/data/profiles');

async function migrateProfiles() {
  console.log('Starting profile migration...');

  // Ensure tables exist
  await ensureProfilesTables();

  const pool = getPool();
  if (!pool) {
    console.error('No database connection');
    return;
  }

  // Read profile index
  const indexPath = path.join(PROFILES_DIR, '_index.json');
  const indexContent = await fs.readFile(indexPath, 'utf8');
  const index = JSON.parse(indexContent);

  // Migrate profile index
  await pool.query(
    `INSERT INTO profile_index (id, payload, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = $1, updated_at = NOW()`,
    [index]
  );

  // Get all profile files
  const profileFiles = await fs.readdir(PROFILES_DIR);
  const profileIds = profileFiles
    .filter(file => file.endsWith('.json') && file !== '_index.json')
    .map(file => file.replace('.json', ''));

  // Update index to include all profiles
  index.profiles = profileIds;
  index.lastUpdated = new Date().toISOString();

  // Migrate profile index
  await pool.query(
    `INSERT INTO profile_index (id, payload, updated_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE SET payload = $1, updated_at = NOW()`,
    [index]
  );

  // Migrate each profile
  for (const profileId of profileIds) {
    try {
      const profilePath = path.join(PROFILES_DIR, `${profileId}.json`);
      const profileContent = await fs.readFile(profilePath, 'utf8');
      const profile = JSON.parse(profileContent);

      await pool.query(
        `INSERT INTO profiles (profile_id, profile, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (profile_id) DO UPDATE SET profile = $2, updated_at = NOW()`,
        [profileId, profile]
      );

      console.log(`Migrated profile: ${profileId}`);
    } catch (error) {
      console.error(`Failed to migrate profile ${profileId}:`, error.message);
      // Continue with other profiles
    }
  }

  console.log('Profile migration completed');
}

// Run migration
migrateProfiles().catch(console.error);
