import express from 'express';
import { loadConfiguratorState } from '../utils/configuratorStore.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const configurator = await loadConfiguratorState();
    res.json({ success: true, configurator });
  } catch (error) {
    console.error('Error loading configurator state:', error);
    res.status(500).json({ success: false, error: 'Failed to load configurator state' });
  }
});

export default router;
