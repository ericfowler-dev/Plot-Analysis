// =============================================================================
// ECM DATA PROCESSING
// Processes parsed ECM data for visualization and analysis
// =============================================================================

import { ECM_THRESHOLDS, ECM_FAULT_MAPPING, ECM_SEVERITY_MAP, ECM_PARAMETERS, ECM_FUEL_TYPES, ECM_SYSTEM_STATES, ECM_HISTOGRAM_CONFIG } from './thresholds.js';

// Process histogram data for visualization
export function processHistogramData(histogram, config) {
  if (!histogram || !histogram.data || !histogram.data.length) return null;
  if (!config) return null;

  const processed = {
    name: histogram.name || 'Unknown',
    title: config.title || histogram.name || 'Histogram',
    xAxis: config.xAxis || 'X Axis',
    yAxis: config.yAxis || 'Y Axis',
    unit: config.unit || '',
    description: config.description || '',
    data: [],
    stats: {
      total: 0,
      maxValue: 0,
      avgValue: 0,
      dataPoints: 0
    }
  };

  // Process data points
  let total = 0;
  let maxValue = 0;
  let pointCount = 0;

  const yLabels = histogram.yLabels || [];
  const xLabels = histogram.xLabels || [];

  for (let y = 0; y < yLabels.length; y++) {
    for (let x = 0; x < xLabels.length; x++) {
      const value = histogram.data[y]?.[x] || 0;

      if (value > 0) {
        processed.data.push({
          x: xLabels[x],
          y: yLabels[y],
          value: value,
          intensity: Math.min(value / 10, 1) // Normalize for visualization
        });

        total += value;
        maxValue = Math.max(maxValue, value);
        pointCount++;
      }
    }
  }

  processed.stats = {
    total: total,
    maxValue: maxValue,
    avgValue: pointCount > 0 ? total / pointCount : 0,
    dataPoints: pointCount
  };

  return processed;
}

// Process all histograms
export function processAllHistograms(histograms, histogramConfig) {
  const processed = {};

  Object.entries(histograms).forEach(([key, histogram]) => {
    const config = histogramConfig[key];
    if (config) {
      processed[key] = processHistogramData(histogram, config);
    }
  });

  return processed;
}

// Process fault data with enhanced information
export function processFaultData(faults) {
  if (!faults || !Array.isArray(faults)) return [];

  return faults.map(fault => {
    if (!fault) return null;

    const faultInfo = ECM_FAULT_MAPPING[fault.code] || {
      name: `Unknown Fault ${fault.code || 'N/A'}`,
      severity: 1,
      category: 'Unknown'
    };

    const severityInfo = ECM_SEVERITY_MAP[faultInfo.severity] || {
      level: 'UNKNOWN',
      color: '#6b7280',
      description: 'Unknown severity'
    };

    // Process snapshot parameters
    const processedSnapshot = {};
    const snapshot = fault.snapshot || {};
    Object.entries(snapshot).forEach(([key, value]) => {
      const paramInfo = ECM_PARAMETERS[key];
      if (paramInfo) {
        processedSnapshot[key] = {
          value: value,
          name: paramInfo.name,
          unit: paramInfo.unit,
          description: paramInfo.description,
          formatted: formatParameterValue(key, value)
        };
      } else {
        processedSnapshot[key] = {
          value: value,
          name: key,
          unit: '',
          formatted: String(value)
        };
      }
    });

    return {
      ...fault,
      faultInfo,
      severityInfo,
      processedSnapshot,
      // Add analysis flags
      isCritical: faultInfo.severity === 3,
      isWarning: faultInfo.severity === 2,
      isInfo: faultInfo.severity === 1
    };
  }).filter(Boolean);
}

// Format parameter values with appropriate units
function formatParameterValue(param, value) {
  const paramInfo = ECM_PARAMETERS[param];
  if (!paramInfo) return String(value);

  // Ensure value is a number
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  if (isNaN(numValue)) return String(value);

  switch (paramInfo.unit) {
    case 'RPM':
      return `${Math.round(numValue)} ${paramInfo.unit}`;
    case 'V':
      return `${numValue.toFixed(2)} ${paramInfo.unit}`;
    case '%':
      return `${numValue.toFixed(1)} ${paramInfo.unit}`;
    case '°':
      return `${numValue.toFixed(1)} ${paramInfo.unit}`;
    case '°F':
      return `${numValue.toFixed(1)} ${paramInfo.unit}`;
    case 'psi':
    case 'psia':
      return `${numValue.toFixed(1)} ${paramInfo.unit}`;
    case 'λ':
      return `${numValue.toFixed(3)} ${paramInfo.unit}`;
    case 'seconds':
      return `${Math.round(numValue)} ${paramInfo.unit}`;
    default:
      return `${numValue.toFixed(2)} ${paramInfo.unit}`;
  }
}

// Analyze ECM data for insights and recommendations
export function analyzeECMData(ecmInfo, histograms, faults, stats) {
  const analysis = {
    summary: {},
    recommendations: [],
    alerts: [],
    insights: []
  };

  // Safe accessors
  const safeStats = stats || {};
  const safeFaults = faults || [];
  const safeHistograms = histograms || {};

  // Engine usage analysis
  const engineHours = safeStats.engineHours || 0;
  const engineStarts = safeStats.engineStarts || 0;

  if (engineHours > 0) {
    analysis.summary.engineUsage = {
      totalHours: engineHours,
      totalStarts: engineStarts,
      avgRuntimePerStart: engineHours / Math.max(engineStarts, 1)
    };

    // Check for unusual usage patterns
    if (engineHours > 1000) {
      analysis.insights.push({
        type: 'info',
        message: `High engine usage detected: ${engineHours.toFixed(1)} hours`,
        priority: 'low'
      });
    }
  }

  // Fault analysis
  if (safeFaults.length > 0) {
    const criticalFaults = safeFaults.filter(f => f && f.isCritical);
    const warningFaults = safeFaults.filter(f => f && f.isWarning);

    analysis.summary.faults = {
      total: safeFaults.length,
      critical: criticalFaults.length,
      warnings: warningFaults.length,
      info: safeFaults.filter(f => f && f.isInfo).length
    };

    // Generate recommendations based on faults
    if (criticalFaults.length > 0) {
      analysis.recommendations.push({
        priority: 'high',
        category: 'Safety',
        message: `${criticalFaults.length} critical fault(s) detected. Immediate inspection required.`,
        faults: criticalFaults.map(f => f.code)
      });
    }

    if (warningFaults.length > 0) {
      analysis.recommendations.push({
        priority: 'medium',
        category: 'Maintenance',
        message: `${warningFaults.length} warning fault(s) detected. Schedule maintenance.`,
        faults: warningFaults.map(f => f.code)
      });
    }
  }

  // Histogram analysis
  if (safeHistograms.speedLoad && safeHistograms.speedLoad.stats && safeHistograms.speedLoad.data) {
    const speedLoad = safeHistograms.speedLoad;

    // Check for dominant operating conditions
    const totalTime = speedLoad.stats.total || 0;
    if (totalTime > 0) {
      analysis.insights.push({
        type: 'info',
        message: `Engine has operated for ${totalTime.toFixed(1)} hours across ${speedLoad.stats.dataPoints || 0} operating conditions`,
        priority: 'low'
      });

      // Check for high-load operation
      const highLoadData = (speedLoad.data || []).filter(point =>
        point && point.x > ECM_THRESHOLDS.manifoldPressure.atmospheric * 1.5
      );
      const highLoadTime = highLoadData.reduce((sum, point) => sum + (point.value || 0), 0);

      if (highLoadTime > totalTime * 0.3) { // More than 30% time at high load
        analysis.insights.push({
          type: 'info',
          message: `High-load operation detected: ${((highLoadTime / totalTime) * 100).toFixed(1)}% of operating time`,
          priority: 'low'
        });
      }
    }
  }

  // Temperature analysis
  if (safeHistograms.ect && safeHistograms.ect.stats && safeHistograms.ect.data) {
    const ectData = safeHistograms.ect;
    const totalTempTime = ectData.stats.total || 0;

    if (totalTempTime > 0) {
      // Check for high temperature operation
      const highTempData = (ectData.data || []).filter(point =>
        point && point.x > ECM_THRESHOLDS.coolantTemp.warningHigh
      );
      const highTempTime = highTempData.reduce((sum, point) => sum + (point.value || 0), 0);

      if (highTempTime > totalTempTime * 0.1) { // More than 10% time at high temp
        analysis.alerts.push({
          level: 'warning',
          message: `Extended high temperature operation detected: ${((highTempTime / totalTempTime) * 100).toFixed(1)}% of time above ${ECM_THRESHOLDS.coolantTemp.warningHigh}°F`,
          recommendation: 'Check cooling system and radiator'
        });
      }
    }
  }

  // Knock analysis
  if (safeHistograms.knock?.stats?.total > ECM_THRESHOLDS.knockDetection.maxEvents) {
    const knockUnits = safeHistograms.knock.stats.total || 0;
    const secondsPerUnit = ECM_HISTOGRAM_CONFIG?.knock?.secondsPerUnit || 1;
    const knockHours = (knockUnits * secondsPerUnit) / 3600;
    analysis.alerts.push({
      level: 'warning',
      message: `High knock activity detected: ${knockHours.toFixed(1)} hours accumulated`,
      recommendation: 'Inspect fuel quality, valve clearance, and ignition system. If engine has high hours with low load, inspect for carbon buildup inside combustion chamber'
    });
  }

  // Backfire analysis
  if (safeHistograms.backfireRecent?.stats?.total > ECM_THRESHOLDS.backfireDetection.maxEvents) {
    analysis.alerts.push({
      level: 'warning',
      message: `Recent backfire events detected: ${safeHistograms.backfireRecent.stats.total} events`,
      recommendation: 'Check ignition system and valve clearance. If no obvious conditions found, record plot file data and submit to PSI Technical Support'
    });
  }

  return analysis;
}

// Generate summary statistics for dashboard
export function generateSummaryStats(ecmInfo, histograms, faults, stats) {
  const safeEcmInfo = ecmInfo || {};
  const safeStats = stats || {};
  const safeFaults = faults || [];
  const safeHistograms = histograms || {};
  const histogramStats = safeStats.histogramStats || {};

  return {
    device: {
      hardwarePN: safeEcmInfo['ECI H/W P/N'] || 'Unknown',
      softwareVersion: safeEcmInfo['ECI Mot XLS Rev'] || 'Unknown',
      serialNumber: safeEcmInfo['ECI H/W S/N'] || 'Unknown',
      engineHours: safeStats.engineHours || 0,
      engineStarts: safeStats.engineStarts || 0
    },
    performance: {
      histogramCount: safeStats.histogramCount || 0,
      totalOperatingHours: Object.values(histogramStats).reduce((sum, h) => sum + (h?.totalHours || 0), 0),
      averageEfficiency: calculateAverageEfficiency(safeHistograms)
    },
    health: {
      faultCount: safeStats.totalFaults || 0,
      criticalFaults: safeFaults.filter(f => f && f.isCritical).length,
      warningFaults: safeFaults.filter(f => f && f.isWarning).length,
      overallHealth: calculateOverallHealth(safeFaults, safeHistograms)
    }
  };
}

// Helper function to calculate average efficiency based on histogram data
function calculateAverageEfficiency(histograms) {
  if (!histograms.speedLoad || !histograms.speedLoad.data || histograms.speedLoad.data.length === 0) {
    return null;
  }

  const speedLoad = histograms.speedLoad;
  const totalTime = speedLoad.stats?.total || 0;

  if (totalTime === 0) return null;

  // Calculate efficiency based on operating conditions:
  // - Higher efficiency when operating in optimal load range (40-80% of max pressure)
  // - Lower efficiency at very low or very high loads
  let weightedEfficiency = 0;
  let totalWeight = 0;

  for (const point of speedLoad.data) {
    const pressure = point.x;
    const value = point.value;

    if (value > 0) {
      // Optimal operating range is around 50-70% of atmospheric pressure boost
      const optimalPressure = ECM_THRESHOLDS.manifoldPressure.atmospheric * 1.3;
      const deviation = Math.abs(pressure - optimalPressure) / optimalPressure;

      // Efficiency decreases as we deviate from optimal
      const pointEfficiency = Math.max(60, 95 - (deviation * 30));

      weightedEfficiency += pointEfficiency * value;
      totalWeight += value;
    }
  }

  return totalWeight > 0 ? Math.round(weightedEfficiency / totalWeight) : null;
}

// Helper function to calculate overall health score
function calculateOverallHealth(faults, histograms) {
  let score = 100; // Start with perfect score

  const safeFaults = faults || [];
  const safeHistograms = histograms || {};

  // Deduct points for faults
  const criticalDeduction = safeFaults.filter(f => f && f.isCritical).length * 20;
  const warningDeduction = safeFaults.filter(f => f && f.isWarning).length * 5;

  score -= criticalDeduction + warningDeduction;

  // Deduct points for abnormal operating conditions
  if (safeHistograms.ect && safeHistograms.ect.data && safeHistograms.ect.stats) {
    const ectData = safeHistograms.ect.data || [];
    const highTempTime = ectData
      .filter(point => point && point.x > ECM_THRESHOLDS.coolantTemp.warningHigh)
      .reduce((sum, point) => sum + (point.value || 0), 0);
    const totalTime = safeHistograms.ect.stats.total || 0;

    if (totalTime > 0) {
      const highTempPercentage = (highTempTime / totalTime) * 100;
      score -= Math.min(highTempPercentage, 20); // Max 20 point deduction
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
