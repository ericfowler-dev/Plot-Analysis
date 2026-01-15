import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const baselinePath = path.join(__dirname, '../data/baselines/good_baseline.json');

router.get('/', async (req, res) => {
  try {
    const raw = await fs.readFile(baselinePath, 'utf-8');
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('Failed to read baseline data:', err);
    res.status(500).json({ error: 'Failed to load baseline data' });
  }
});

export default router;
