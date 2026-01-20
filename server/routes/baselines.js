import express from 'express';
import {
  loadBaselineData,
  loadBaselineIndex,
  addBaselineGroup,
  addBaselineSize,
  addBaselineApplication,
  setGroupArchived,
  setSizeArchived,
  setApplicationArchived
} from '../utils/baselineStore.js';
import { requireAdmin, getAdminActor } from '../utils/adminAuth.js';
import { recordConfiguratorChange } from '../utils/configuratorStore.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [data, index] = await Promise.all([
      loadBaselineData(),
      loadBaselineIndex()
    ]);
    res.json({ data, index });
  } catch (err) {
    console.error('Failed to read baseline data:', err);
    res.status(500).json({ error: 'Failed to load baseline data' });
  }
});

router.post('/groups', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const index = await addBaselineGroup(name);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'baseline.group.create',
      details: { name }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Failed to create baseline group:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/sizes', requireAdmin, async (req, res) => {
  try {
    const { group, name } = req.body;
    const index = await addBaselineSize(group, name);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'baseline.size.create',
      details: { group, name }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Failed to create baseline size:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/applications', requireAdmin, async (req, res) => {
  try {
    const { group, size, name } = req.body;
    const index = await addBaselineApplication(group, size, name);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'baseline.application.create',
      details: { group, size, name }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Failed to create baseline application:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/groups/:name', requireAdmin, async (req, res) => {
  try {
    const { name } = req.params;
    const { archived } = req.body;
    const index = await setGroupArchived(name, archived);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'baseline.group.archive',
      details: { name, archived: Boolean(archived) }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Failed to update baseline group:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/sizes/:group/:name', requireAdmin, async (req, res) => {
  try {
    const { group, name } = req.params;
    const { archived } = req.body;
    const index = await setSizeArchived(group, name, archived);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'baseline.size.archive',
      details: { group, name, archived: Boolean(archived) }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Failed to update baseline size:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/applications/:group/:size/:name', requireAdmin, async (req, res) => {
  try {
    const { group, size, name } = req.params;
    const { archived } = req.body;
    const index = await setApplicationArchived(group, size, name, archived);
    await recordConfiguratorChange({
      actor: req.adminActor || getAdminActor(req),
      action: 'baseline.application.archive',
      details: { group, size, name, archived: Boolean(archived) }
    });
    res.json({ success: true, index });
  } catch (error) {
    console.error('Failed to update baseline application:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
