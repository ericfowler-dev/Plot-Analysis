import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import uploadRouter from './routes/upload.js';
import thresholdsRouter from './routes/thresholds.js';
import baselinesRouter from './routes/baselines.js';
import configuratorRouter from './routes/configurator.js';
import issuesRouter from './routes/issues.js';
import { getPool } from './db/pool.js';
import { ensureAllTables } from './db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api', uploadRouter);
app.use('/api/thresholds', thresholdsRouter);
app.use('/api/baselines', baselinesRouter);
app.use('/api/configurator', configuratorRouter);
app.use('/api', issuesRouter);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// DB health check
app.get('/api/health/db', async (req, res) => {
  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ status: 'unavailable', reason: 'no DATABASE_URL configured' });
  }
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// API error handler (ensure JSON responses for upload/parser failures)
app.use((err, req, res, next) => {
  if (!err) return next();
  if (req.path.startsWith('/api')) {
    const status = err.statusCode || err.status || 400;
    const message = err.message || 'Request failed';
    res.status(status).json({ error: message });
    return;
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
  // Initialize database tables if DB is configured
  ensureAllTables().catch(err => {
    console.error('Failed to initialize database tables:', err.message);
  });
});

export default app;
