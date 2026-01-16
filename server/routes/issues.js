import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const ISSUES_FILE = path.join(__dirname, '../data/issues.json');

// Ensure issues file exists
function ensureIssuesFile() {
  const dir = path.dirname(ISSUES_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(ISSUES_FILE)) {
    fs.writeFileSync(ISSUES_FILE, JSON.stringify([], null, 2));
  }
}

// Submit a new issue
router.post('/issues', (req, res) => {
  try {
    ensureIssuesFile();

    const { title, description, type, email } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const issues = JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf-8'));

    const newIssue = {
      id: Date.now(),
      title,
      description,
      type: type || 'bug',
      email: email || null,
      status: 'open',
      createdAt: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    };

    issues.push(newIssue);
    fs.writeFileSync(ISSUES_FILE, JSON.stringify(issues, null, 2));

    res.json({ success: true, issue: newIssue });
  } catch (error) {
    console.error('Error saving issue:', error);
    res.status(500).json({ error: 'Failed to save issue' });
  }
});

// Get all issues (for admin viewing)
router.get('/issues', (req, res) => {
  try {
    ensureIssuesFile();
    const issues = JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf-8'));
    res.json(issues);
  } catch (error) {
    console.error('Error reading issues:', error);
    res.status(500).json({ error: 'Failed to read issues' });
  }
});

export default router;
