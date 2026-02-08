import React, { useState, useEffect } from 'react';
import { X, FileText, Check, Cpu, ToggleLeft, ToggleRight } from 'lucide-react';

// =============================================================================
// FILE ROLE MODAL
// Modal dialog for designating Primary/Secondary roles when 2+ files uploaded.
// Supports two modes:
//   - Dual ECM V-Engine: Primary/Secondary mapped per ECM bank
//   - Single ECM Engine: Compare plots from different times on same engine
// =============================================================================

const FileRoleModal = ({ isOpen, pendingFiles, onComplete, onCancel }) => {
  const [ecmRoles, setEcmRoles] = useState({});
  const [bplotRoles, setBplotRoles] = useState({});
  const [engineMode, setEngineMode] = useState('single'); // 'single' or 'dual'

  // Initialize roles from pending files
  useEffect(() => {
    if (!pendingFiles) return;

    // Auto-detect mode: if ECM files need role selection, default to dual
    if (pendingFiles.needsEcmRoleSelection && pendingFiles.ecmFiles?.length > 1) {
      setEngineMode('dual');
    } else {
      setEngineMode('single');
    }

    if (pendingFiles.ecmFiles?.length > 0) {
      const initial = {};
      pendingFiles.ecmFiles.forEach((file, idx) => {
        initial[file.id] = file.role || (idx === 0 ? 'primary' : 'secondary');
      });
      setEcmRoles(initial);
    }

    if (pendingFiles.bplotFiles?.length > 0) {
      const initial = {};
      pendingFiles.bplotFiles.forEach((file, idx) => {
        initial[file.id] = file.role || (idx === 0 ? 'primary' : 'secondary');
      });
      setBplotRoles(initial);
    }
  }, [pendingFiles]);

  if (!isOpen || !pendingFiles) return null;

  const { ecmFiles = [], bplotFiles = [], needsEcmRoleSelection, needsBplotRoleSelection } = pendingFiles;

  const isDualMode = engineMode === 'dual';

  const handleEcmRoleChange = (fileId, role) => {
    setEcmRoles(prev => {
      const updated = { ...prev };
      if (role === 'primary') {
        Object.keys(updated).forEach(id => {
          updated[id] = id === fileId ? 'primary' : 'secondary';
        });
      } else {
        updated[fileId] = role;
      }
      return updated;
    });
  };

  const handleBplotRoleChange = (fileId, role) => {
    setBplotRoles(prev => {
      const updated = { ...prev };
      if (role === 'primary') {
        Object.keys(updated).forEach(id => {
          updated[id] = id === fileId ? 'primary' : 'secondary';
        });
      } else {
        updated[fileId] = role;
      }
      return updated;
    });
  };

  const handleConfirm = () => {
    const updatedEcmFiles = ecmFiles.map(file => ({
      ...file,
      role: isDualMode ? (ecmRoles[file.id] || 'secondary') : 'primary'
    }));

    const updatedBplotFiles = bplotFiles.map(file => ({
      ...file,
      role: bplotRoles[file.id] || 'secondary'
    }));

    onComplete({ ecmFiles: updatedEcmFiles, bplotFiles: updatedBplotFiles, engineMode });
  };

  // Validation
  const hasEcmPrimary = Object.values(ecmRoles).includes('primary');
  const hasBplotPrimary = Object.values(bplotRoles).includes('primary');
  const canConfirm = isDualMode
    ? (!needsEcmRoleSelection || hasEcmPrimary) && (!needsBplotRoleSelection || hasBplotPrimary)
    : (!needsBplotRoleSelection || hasBplotPrimary);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-green-500/30 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
          <div>
            <h2
              className="text-lg font-bold text-green-400 tracking-wide"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              SELECT FILE ROLES
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {isDualMode
                ? 'For dual ECM engines, map files as Primary Plot + Primary ECM and Secondary Plot + Secondary ECM'
                : 'Compare two plots from different times on the same engine'
              }
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Engine Mode Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEngineMode('single')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-wider rounded-lg border transition-all ${
                !isDualMode
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
              }`}
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              <Cpu className="w-5 h-5" />
              Single ECM Engine
            </button>
            <button
              onClick={() => setEngineMode('dual')}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-bold uppercase tracking-wider rounded-lg border transition-all ${
                isDualMode
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-300 shadow-lg shadow-orange-500/10'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
              }`}
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              <Cpu className="w-5 h-5" />
              Dual ECM V-Engine
            </button>
          </div>

          {/* ECM Files Section - only in dual mode */}
          {isDualMode && needsEcmRoleSelection && ecmFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-orange-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                ECM Files ({ecmFiles.length})
              </h3>
              <div className="space-y-2">
                {ecmFiles.map(file => (
                  <FileRoleRow
                    key={file.id}
                    file={file}
                    role={ecmRoles[file.id]}
                    onRoleChange={(role) => handleEcmRoleChange(file.id, role)}
                    type="ECM"
                  />
                ))}
              </div>
            </div>
          )}

          {/* BPLOT Files Section */}
          {needsBplotRoleSelection && bplotFiles.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-green-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                B-Plot Files ({bplotFiles.length})
              </h3>
              <div className="space-y-2">
                {bplotFiles.map(file => (
                  <FileRoleRow
                    key={file.id}
                    file={file}
                    role={bplotRoles[file.id]}
                    onRoleChange={(role) => handleBplotRoleChange(file.id, role)}
                    type="BPLOT"
                    engineMode={engineMode}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Info box - context-dependent */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-sm text-slate-300">
                {isDualMode ? (
                  <>
                    <p className="font-medium text-white mb-1">About Primary/Secondary Roles</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-400">
                      <li><span className="text-blue-400">Primary</span> - Main ECM data used for overview displays</li>
                      <li><span className="text-slate-300">Secondary</span> - Comparison data shown in ECM Compare view</li>
                      <li>Dual-plot V-engine upload: Primary B-Plot + Primary ECM, Secondary B-Plot + Secondary ECM</li>
                      <li>Faults from both ECMs are combined with source attribution</li>
                      <li>Histogram differences help identify ECM-specific issues</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-white mb-1">Comparing Plots from Different Times</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-400">
                      <li><span className="text-blue-400">First Plot</span> - Baseline or reference plot (e.g., before service)</li>
                      <li><span className="text-slate-300">Second Plot</span> - Comparison plot (e.g., after service)</li>
                      <li>Use Overlay P+S to view both plots on the same chart</li>
                      <li>First Plot traces are solid lines, Second Plot traces are dashed</li>
                      <li>Color-coded for quick visual comparison across channels</li>
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700/50 bg-slate-800/30">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-600/50 border border-slate-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-5 py-2 text-sm font-bold uppercase tracking-wider rounded-lg transition-all flex items-center gap-2
              ${canConfirm
                ? 'bg-green-500 text-black hover:bg-green-400 shadow-lg shadow-green-500/20'
                : 'bg-slate-600 text-slate-400 cursor-not-allowed'
              }`}
            style={{ fontFamily: 'Orbitron, sans-serif' }}
          >
            <Check className="w-4 h-4" />
            Confirm Roles
          </button>
        </div>
      </div>
    </div>
  );
};

// Individual file row with role selection
const FileRoleRow = ({ file, role, onRoleChange, type, engineMode }) => {
  const isPrimary = role === 'primary';
  const isEcm = type === 'ECM';
  const isSingleMode = engineMode === 'single' && !isEcm;
  const primaryLabel = isSingleMode ? 'First Plot' : 'Primary';
  const secondaryLabel = isSingleMode ? 'Second Plot' : 'Secondary';

  return (
    <div className={`
      flex items-center justify-between p-3 rounded-lg border transition-all
      ${isPrimary
        ? isEcm
          ? 'bg-orange-500/10 border-orange-500/40'
          : 'bg-green-500/10 border-green-500/40'
        : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
      }
    `}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`
          w-8 h-8 rounded flex items-center justify-center flex-shrink-0
          ${isEcm ? 'bg-orange-500/20' : 'bg-green-500/20'}
        `}>
          <FileText className={`w-4 h-4 ${isEcm ? 'text-orange-400' : 'text-green-400'}`} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-white truncate" title={file.fileName}>
            {file.fileName}
          </div>
          {file.ecmInfo?.['Hour meter'] && (
            <div className="text-xs text-slate-400">
              Hours: {parseFloat(file.ecmInfo['Hour meter']).toFixed(1)}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onRoleChange('primary')}
          className={`
            px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all
            ${isPrimary
              ? isEcm
                ? 'bg-orange-500 text-black shadow-lg shadow-orange-500/20'
                : 'bg-green-500 text-black shadow-lg shadow-green-500/20'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }
          `}
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          {primaryLabel}
        </button>
        <button
          onClick={() => onRoleChange('secondary')}
          className={`
            px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all
            ${!isPrimary
              ? 'bg-slate-500 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }
          `}
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
};

export default FileRoleModal;
