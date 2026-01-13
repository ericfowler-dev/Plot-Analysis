import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert a .bplt file to CSV using the Python decoder
 * @param {string} inputPath - Path to the .bplt file
 * @param {string} outputPath - Path for the output CSV file
 * @returns {Promise<void>}
 */
export function convertBpltToCSV(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '../python/bplt_converter.py');

    // Try python3 first, then python
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    const pythonProcess = spawn(pythonCmd, [pythonScript, inputPath, outputPath]);

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code === 0) {
        console.log('BPLT conversion successful');
        resolve();
      } else {
        console.error('BPLT conversion failed:', stderr);
        reject(new Error(`BPLT conversion failed: ${stderr || 'Unknown error'}`));
      }
    });

    pythonProcess.on('error', (error) => {
      // If python command not found, try alternative
      if (error.code === 'ENOENT') {
        const altPythonCmd = process.platform === 'win32' ? 'python3' : 'python';
        const altProcess = spawn(altPythonCmd, [pythonScript, inputPath, outputPath]);

        altProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error('Python not found. Please ensure Python 3.x is installed.'));
          }
        });

        altProcess.on('error', () => {
          reject(new Error('Python not found. Please ensure Python 3.x is installed and in PATH.'));
        });
      } else {
        reject(error);
      }
    });
  });
}
