import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../db/pool.js';
import { ensureIssuesTable } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const ISSUES_FILE = path.join(__dirname, '../data/issues.json');

// GitHub configuration
const GITHUB_OWNER = 'ericfowler-dev';
const GITHUB_REPO = 'Plot-Analysis';

// Ensure issues file exists (for local fallback)
function ensureIssuesFile() {
  const dir = path.dirname(ISSUES_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(ISSUES_FILE)) {
    fs.writeFileSync(ISSUES_FILE, JSON.stringify([], null, 2));
  }
}

// Create GitHub issue
async function createGitHubIssue(title, description, type, email) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return null;
  }

  // Map type to GitHub label
  const labelMap = {
    bug: 'bug',
    feature: 'enhancement',
    question: 'question',
    other: 'feedback'
  };

  const body = `${description}

---
**Submitted via Plot Analyzer**
- Type: ${type}
- Email: ${email || 'Not provided'}
- Submitted: ${new Date().toISOString()}`;

  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      title,
      body,
      labels: [labelMap[type] || 'feedback']
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('GitHub API error:', error);
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return await response.json();
}

// Save to local file (fallback)
function saveToLocalFile(issue) {
  ensureIssuesFile();
  const issues = JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf-8'));
  issues.push(issue);
  fs.writeFileSync(ISSUES_FILE, JSON.stringify(issues, null, 2));
}

async function saveToDatabase(issue) {
  const pool = getPool();
  if (!pool) return null;
  await ensureIssuesTable();
  const result = await pool.query(
    `INSERT INTO issues (title, description, type, email, status, user_agent, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      issue.title,
      issue.description,
      issue.type,
      issue.email,
      issue.status || 'open',
      issue.userAgent || null,
      'db'
    ]
  );
  return {
    ...issue,
    id: result.rows[0].id,
    createdAt: result.rows[0].created_at,
    source: 'db'
  };
}

// Submit a new issue
router.post('/issues', async (req, res) => {
  try {
    const { title, description, type, email } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    const issueType = type || 'bug';

    // Try GitHub first if token is available
    if (process.env.GITHUB_TOKEN) {
      try {
        const ghIssue = await createGitHubIssue(title, description, issueType, email);
        console.log(`GitHub issue created: #${ghIssue.number}`);
        return res.json({
          success: true,
          issue: {
            id: ghIssue.number,
            title,
            description,
            type: issueType,
            url: ghIssue.html_url,
            source: 'github'
          }
        });
      } catch (ghError) {
        console.error('GitHub issue creation failed, falling back to local:', ghError.message);
        // Fall through to local storage
      }
    }

    // Try database if available
    const dbIssue = await saveToDatabase({
      title,
      description,
      type: issueType,
      email: email || null,
      status: 'open',
      createdAt: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    });

    if (dbIssue) {
      return res.json({ success: true, issue: dbIssue });
    }

    // Fallback to local file storage
    const newIssue = {
      id: Date.now(),
      title,
      description,
      type: issueType,
      email: email || null,
      status: 'open',
      createdAt: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown',
      source: 'local'
    };

    saveToLocalFile(newIssue);
    console.log('Issue saved locally:', newIssue.id);

    res.json({ success: true, issue: newIssue });
  } catch (error) {
    console.error('Error saving issue:', error);
    res.status(500).json({ error: 'Failed to save issue' });
  }
});

// Get all issues (for admin viewing - local only)
router.get('/issues', (req, res) => {
  try {
    const pool = getPool();
    if (pool) {
      ensureIssuesTable()
        .then(() => pool.query('SELECT * FROM issues ORDER BY created_at DESC'))
        .then(result => res.json(result.rows))
        .catch(err => {
          console.error('DB read failed, falling back to local:', err.message);
          ensureIssuesFile();
          const issues = JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf-8'));
          res.json(issues);
        });
    } else {
      ensureIssuesFile();
      const issues = JSON.parse(fs.readFileSync(ISSUES_FILE, 'utf-8'));
      res.json(issues);
    }
  } catch (error) {
    console.error('Error reading issues:', error);
    res.status(500).json({ error: 'Failed to read issues' });
  }
});

export default router;
