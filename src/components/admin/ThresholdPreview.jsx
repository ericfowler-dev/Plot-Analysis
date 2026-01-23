/**
 * ThresholdPreview - Config 3.0
 * File upload and threshold preview with visualization
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { detectAnomalies, summarizeAlerts } from '../../lib/anomalyEngine';
import { PARAMETER_CATALOG } from '../../lib/parameterCatalog';

/**
 * File upload dropzone
 */
function FileDropzone({ onFileSelect, isLoading }) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
        ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'}
        ${isLoading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {isLoading ? (
        <div className="flex flex-col items-center">
          <svg className="animate-spin h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-4 text-gray-600">Processing file...</p>
        </div>
      ) : (
        <>
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="mt-4 text-lg font-medium text-gray-900">
            Drop a data file here or click to browse
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Supports CSV files
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Alert badge component
 */
function AlertBadge({ severity, count }) {
  const colors = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200'
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${colors[severity] || colors.info}`}>
      {count} {severity}
    </span>
  );
}

/**
 * Alert list item
 */
function AlertItem({ alert }) {
  const severityColors = {
    critical: 'border-l-red-500 bg-red-50',
    warning: 'border-l-yellow-500 bg-yellow-50',
    info: 'border-l-blue-500 bg-blue-50'
  };

  return (
    <div className={`border-l-4 p-4 ${severityColors[alert.severity] || severityColors.info}`}>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-gray-900">{alert.name}</h4>
          {alert.description && (
            <p className="text-sm text-gray-600 mt-1">{alert.description}</p>
          )}
        </div>
        <span className={`
          px-2 py-1 text-xs font-medium rounded
          ${alert.severity === 'critical' ? 'bg-red-600 text-white' :
            alert.severity === 'warning' ? 'bg-yellow-500 text-white' :
            'bg-blue-500 text-white'}
        `}>
          {alert.severity?.toUpperCase()}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
        {alert.startTime !== undefined && (
          <span>Start: {alert.startTime.toFixed(1)}s</span>
        )}
        {alert.duration !== undefined && (
          <span>Duration: {alert.duration.toFixed(1)}s</span>
        )}
        {alert.value !== undefined && alert.value !== null && (
          <span>Value: {typeof alert.value === 'number' ? alert.value.toFixed(2) : alert.value}{alert.unit || ''}</span>
        )}
        {alert.threshold !== undefined && (
          <span>Threshold: {alert.threshold}{alert.unit || ''}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Simple time series mini chart
 */
function MiniChart({ data, paramKey, thresholds, height = 100 }) {

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    // Find the column name
    const param = PARAMETER_CATALOG[paramKey];
    const columns = param?.dataColumns || [paramKey];
    let columnName = null;
    for (const col of columns) {
      if (data[0][col] !== undefined) {
        columnName = col;
        break;
      }
    }
    if (!columnName) return null;

    // Extract values
    const values = data
      .map((row, i) => ({
        x: row.Time ?? i,
        y: parseFloat(row[columnName])
      }))
      .filter(v => !isNaN(v.y));

    if (values.length === 0) return null;

    const minX = values[0].x;
    const maxX = values[values.length - 1].x;
    const minY = Math.min(...values.map(v => v.y));
    const maxY = Math.max(...values.map(v => v.y));

    // Add padding to Y range
    const yPadding = (maxY - minY) * 0.1 || 1;
    const yMin = minY - yPadding;
    const yMax = maxY + yPadding;

    return { values, minX, maxX, yMin, yMax, columnName };
  }, [data, paramKey]);

  if (!chartData) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded" style={{ height }}>
        <span className="text-sm text-gray-400">No data available</span>
      </div>
    );
  }

  const { values, minX, maxX, yMin, yMax } = chartData;
  const width = 400;

  // Scale functions
  const scaleX = (x) => ((x - minX) / (maxX - minX)) * width;
  const scaleY = (y) => height - ((y - yMin) / (yMax - yMin)) * height;

  // Generate path
  const pathData = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(v.x)} ${scaleY(v.y)}`)
    .join(' ');

  // Get threshold lines
  const warningMax = thresholds?.warning?.max;
  const warningMin = thresholds?.warning?.min;
  const criticalMax = thresholds?.critical?.max;
  const criticalMin = thresholds?.critical?.min;

  return (
    <div className="bg-gray-50 rounded-lg p-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        {/* Critical zones */}
        {criticalMax !== undefined && criticalMax <= yMax && (
          <rect
            x={0}
            y={0}
            width={width}
            height={scaleY(criticalMax)}
            fill="rgba(239, 68, 68, 0.1)"
          />
        )}
        {criticalMin !== undefined && criticalMin >= yMin && (
          <rect
            x={0}
            y={scaleY(criticalMin)}
            width={width}
            height={height - scaleY(criticalMin)}
            fill="rgba(239, 68, 68, 0.1)"
          />
        )}

        {/* Warning zones */}
        {warningMax !== undefined && warningMax <= yMax && (
          <rect
            x={0}
            y={scaleY(criticalMax ?? yMax)}
            width={width}
            height={scaleY(warningMax) - scaleY(criticalMax ?? yMax)}
            fill="rgba(245, 158, 11, 0.1)"
          />
        )}
        {warningMin !== undefined && warningMin >= yMin && (
          <rect
            x={0}
            y={scaleY(warningMin)}
            width={width}
            height={scaleY(criticalMin ?? yMin) - scaleY(warningMin)}
            fill="rgba(245, 158, 11, 0.1)"
          />
        )}

        {/* Threshold lines */}
        {criticalMax !== undefined && criticalMax <= yMax && (
          <line x1={0} y1={scaleY(criticalMax)} x2={width} y2={scaleY(criticalMax)}
            stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2" />
        )}
        {criticalMin !== undefined && criticalMin >= yMin && (
          <line x1={0} y1={scaleY(criticalMin)} x2={width} y2={scaleY(criticalMin)}
            stroke="#ef4444" strokeWidth={1} strokeDasharray="4 2" />
        )}
        {warningMax !== undefined && warningMax <= yMax && (
          <line x1={0} y1={scaleY(warningMax)} x2={width} y2={scaleY(warningMax)}
            stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 2" />
        )}
        {warningMin !== undefined && warningMin >= yMin && (
          <line x1={0} y1={scaleY(warningMin)} x2={width} y2={scaleY(warningMin)}
            stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 2" />
        )}

        {/* Data line */}
        <path d={pathData} fill="none" stroke="#3b82f6" strokeWidth={1.5} />
      </svg>

      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>{yMin.toFixed(1)}</span>
        <span className="font-medium text-gray-600">{chartData.columnName}</span>
        <span>{yMax.toFixed(1)}</span>
      </div>
    </div>
  );
}

/**
 * Statistics summary card
 */
function StatCard({ label, value, subtext, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    red: 'bg-red-50 border-red-200 text-red-900'
  };

  return (
    <div className={`border rounded-lg p-4 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subtext && <p className="text-xs opacity-60 mt-1">{subtext}</p>}
    </div>
  );
}

/**
 * Main ThresholdPreview component
 */
export default function ThresholdPreview({ thresholds, anomalyRules }) {
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [selectedParam, setSelectedParam] = useState('coolantTemp');

  const handleFileSelect = useCallback(async (selectedFile) => {
    setIsLoading(true);
    setError(null);
    setFile(selectedFile);

    try {
      // Read the file
      const text = await selectedFile.text();

      // Parse CSV
      const lines = text.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('File has no data rows');
      }

      const headers = lines[0].split(',').map(h => h.trim());
      const data = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const row = {};
        for (let j = 0; j < headers.length; j++) {
          const val = values[j]?.trim();
          row[headers[j]] = val === '' ? null : isNaN(val) ? val : parseFloat(val);
        }
        data.push(row);
      }

      setFileData(data);

      // Run anomaly detection
      const resolvedProfile = {
        thresholds: thresholds || {},
        anomalyRules: anomalyRules || []
      };

      const detectionResults = detectAnomalies(data, resolvedProfile, {
        gracePeriod: 5,
        minDuration: 0
      });

      setResults(detectionResults);
    } catch (err) {
      console.error('Error processing file:', err);
      setError(err.message || 'Failed to process file');
      setFileData(null);
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  }, [thresholds, anomalyRules]);

  const handleClearFile = useCallback(() => {
    setFile(null);
    setFileData(null);
    setResults(null);
    setError(null);
  }, []);

  // Re-run detection when thresholds change
  const handleRerun = useCallback(() => {
    if (fileData) {
      setIsLoading(true);
      try {
        const resolvedProfile = {
          thresholds: thresholds || {},
          anomalyRules: anomalyRules || []
        };

        const detectionResults = detectAnomalies(fileData, resolvedProfile, {
          gracePeriod: 5,
          minDuration: 0
        });

        setResults(detectionResults);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
  }, [fileData, thresholds, anomalyRules]);

  // Summarize results
  const summary = useMemo(() => {
    if (!results) return null;
    return summarizeAlerts(results.alerts);
  }, [results]);

  // Available parameters for chart dropdown
  const availableParams = useMemo(() => {
    if (!fileData || fileData.length === 0) return [];

    const params = [];
    for (const [id, param] of Object.entries(PARAMETER_CATALOG)) {
      for (const col of param.dataColumns) {
        if (fileData[0][col] !== undefined) {
          params.push({ id, name: param.name, column: col });
          break;
        }
      }
    }
    return params;
  }, [fileData]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Threshold Preview</h3>
        <p className="text-sm text-gray-500">
          Upload a data file to see how your threshold configuration would detect anomalies
        </p>
      </div>

      {/* File upload or file info */}
      {!file ? (
        <FileDropzone onFileSelect={handleFileSelect} isLoading={isLoading} />
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {fileData ? `${fileData.length.toLocaleString()} data points` : 'Processing...'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRerun}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
              >
                Re-run Analysis
              </button>
              <button
                onClick={handleClearFile}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Clear File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="font-medium text-red-900">Error processing file</h4>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && summary && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Samples"
              value={results.statistics.totalSamples.toLocaleString()}
              color="blue"
            />
            <StatCard
              label="Running Samples"
              value={results.statistics.runningSamples.toLocaleString()}
              subtext={`${((results.statistics.runningSamples / results.statistics.totalSamples) * 100).toFixed(1)}% of data`}
              color="green"
            />
            <StatCard
              label="Critical Alerts"
              value={summary.critical.length}
              subtext={summary.totalDuration.critical > 0 ? `${summary.totalDuration.critical.toFixed(1)}s total` : ''}
              color={summary.critical.length > 0 ? 'red' : 'green'}
            />
            <StatCard
              label="Warning Alerts"
              value={summary.warning.length}
              subtext={summary.totalDuration.warning > 0 ? `${summary.totalDuration.warning.toFixed(1)}s total` : ''}
              color={summary.warning.length > 0 ? 'yellow' : 'green'}
            />
          </div>

          {/* Chart preview */}
          {availableParams.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-900">Parameter Preview</h4>
                <select
                  value={selectedParam}
                  onChange={(e) => setSelectedParam(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
                >
                  {availableParams.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <MiniChart
                data={fileData}
                paramKey={selectedParam}
                thresholds={thresholds?.[selectedParam]}
                height={150}
              />
            </div>
          )}

          {/* Alert list */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Detected Alerts</h4>
              <div className="flex gap-2">
                <AlertBadge severity="critical" count={summary.critical.length} />
                <AlertBadge severity="warning" count={summary.warning.length} />
                <AlertBadge severity="info" count={summary.info.length} />
              </div>
            </div>

            {results.alerts.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <svg className="mx-auto h-12 w-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="mt-2 font-medium text-green-700">No anomalies detected</p>
                <p className="text-sm text-gray-500">The data passed all threshold checks</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {results.alerts.map((alert, index) => (
                  <AlertItem key={`${alert.id}-${index}`} alert={alert} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
