import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { detectFileType, FILE_TYPES } from '../utils/fileDetector.js';
import { convertBpltToCSV } from '../utils/bpltConverter.js';
import { getPool } from '../db/pool.js';
import { ensureUploadsTable } from '../db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.csv', '.bplt', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`));
    }
  }
});

// Upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase();

    let resultFilePath = filePath;
    let fileType;

    // Register upload in DB if available
    let uploadId = null;
    const pool = getPool();
    if (pool) {
      await ensureUploadsTable();
      const meta = await pool.query(
        `INSERT INTO uploads (original_name, stored_name, file_type, size_bytes, status, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [originalName, path.basename(filePath), 'pending', req.file.size, 'pending', {}]
      );
      uploadId = meta.rows[0].id;
    }

    // Handle .bplt files - convert to CSV first
    if (ext === '.bplt') {
      console.log('Converting BPLT file to CSV...');
      const csvPath = filePath.replace('.bplt', '.csv');
      await convertBpltToCSV(filePath, csvPath);
      resultFilePath = csvPath;
      fileType = FILE_TYPES.BPLOT_CSV;

      // Clean up original .bplt file
      fs.unlinkSync(filePath);
    } else {
      // Detect file type for CSV files
      fileType = await detectFileType(filePath);
    }

    // Read the file content
    const fileContent = fs.readFileSync(resultFilePath, 'utf-8');

    // Clean up uploaded file
    fs.unlinkSync(resultFilePath);

    // Update upload status
    if (pool && uploadId) {
      await pool.query(
        `UPDATE uploads SET file_type = $1, status = 'processed', metadata = $2 WHERE id = $3`,
        [fileType, { finalPath: path.basename(resultFilePath) }, uploadId]
      );
    }

    res.json({
      success: true,
      fileType,
      fileName: originalName,
      content: fileContent
    });

  } catch (error) {
    console.error('Upload error:', error);

    // Clean up any uploaded files on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Update upload status on error
    const pool = getPool();
    if (pool) {
      await ensureUploadsTable();
      await pool.query(
        `INSERT INTO uploads (original_name, stored_name, file_type, size_bytes, status, metadata)
         VALUES ($1, $2, $3, $4, 'error', $5)`,
        [req.file?.originalname || 'unknown', req.file?.filename || 'unknown', null, req.file?.size || 0, { error: error.message }]
      );
    }

    res.status(500).json({
      error: error.message || 'Failed to process file'
    });
  }
});

// Get file type info endpoint
router.post('/detect-type', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let fileType;

    if (ext === '.bplt') {
      fileType = FILE_TYPES.BPLOT_BINARY;
    } else {
      fileType = await detectFileType(req.file.path);
    }

    // Clean up
    fs.unlinkSync(req.file.path);

    res.json({
      fileType,
      fileName: req.file.originalname
    });

  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
