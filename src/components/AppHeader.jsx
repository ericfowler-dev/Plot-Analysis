import React from 'react';
import { Upload, FileSpreadsheet, Download, Bug, Settings } from 'lucide-react';

// =============================================================================
// BMS DATA ANALYZER - TRON-STYLE HEADER
// Handles file-type-aware navigation tabs based on loaded files
// =============================================================================

const GUI_REVISION_LABEL = 'config v3.1 app v2.6.9';

// Tab configurations based on file types loaded
const TAB_CONFIGS = {
  // ECM only: Overview - Charts - Fault Timeline
  ecmOnly: [
    { id: 'overview', label: 'Overview', source: null },
    { id: 'charts', label: 'Charts', source: null },
    { id: 'faults', label: 'Fault Timeline', source: null }
  ],
  // Multi-ECM only (Primary + Secondary): Overview - ECM Compare - Faults
  multiEcm: [
    { id: 'overview', label: 'Overview', source: null },
    { id: 'ecm-compare', label: 'ECM Compare', source: null },
    { id: 'fault-correlation', label: 'Fault Correlation', source: null },
    { id: 'charts', label: 'Charts', source: null }
  ],
  // BPLT only: Overview - Charts - Channels - Events
  bpltOnly: [
    { id: 'overview', label: 'Overview', source: null },
    { id: 'charts', label: 'Charts', source: null },
    { id: 'channels', label: 'Channels', source: null },
    { id: 'events', label: 'Events', source: null }
  ],
  // Both ECM + BPLT: Overview (ECM) - Overview (BPLT) - Charts (ECM) - Charts (BPLT) - Fault Timeline (ECM) - Channels (BPLT) - Events (BPLT)
  both: [
    { id: 'overview-ecm', label: 'Overview', source: 'ECM' },
    { id: 'overview-bplt', label: 'Overview', source: 'BPLT' },
    { id: 'charts-ecm', label: 'Charts', source: 'ECM' },
    { id: 'charts-bplt', label: 'Charts', source: 'BPLT' },
    { id: 'faults-ecm', label: 'Fault Timeline', source: 'ECM' },
    { id: 'channels-bplt', label: 'Channels', source: 'BPLT' },
    { id: 'events-bplt', label: 'Events', source: 'BPLT' }
  ],
  // Full System: Multi-ECM + BPLT - Overview - ECM Compare - Charts (BPLT) - Combined Faults - Channels - Events
  fullSystem: [
    { id: 'overview-ecm', label: 'Overview', source: 'ECM' },
    { id: 'ecm-compare', label: 'ECM Compare', source: null },
    { id: 'charts-ecm', label: 'Charts', source: 'ECM' },
    { id: 'fault-correlation', label: 'Fault Correlation', source: null },
    { id: 'overview-bplt', label: 'Overview', source: 'BPLT' },
    { id: 'charts-bplt', label: 'Charts', source: 'BPLT' },
    { id: 'channels-bplt', label: 'Channels', source: 'BPLT' },
    { id: 'events-bplt', label: 'Events', source: 'BPLT' }
  ]
};

// Source badge component
const SourceBadge = ({ source }) => {
  if (!source) return null;

  const isEcm = source === 'ECM';
  return (
    <span className={`
      text-[9px] px-1.5 py-0.5 rounded-sm ml-1.5 font-bold tracking-wide
      ${isEcm
        ? 'bg-orange-500/15 border border-orange-500/40 text-orange-400'
        : 'bg-green-500/15 border border-green-500/40 text-green-400'
      }
    `} style={{ fontFamily: 'Orbitron, sans-serif' }}>
      {source}
    </span>
  );
};

// Active profile indicator
const ProfileIndicator = ({ profileName, profileId }) => {
  if (!profileName) return null;

  // Shorten common prefixes for cleaner display
  const shortName = profileName
    .replace('PSI HD ', '')
    .replace('Global Defaults', 'Defaults')
    .replace(' with MFG Fuel System', ' MFG');

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-[10px]"
      title={`Active Profile: ${profileName}`}
    >
      <Settings className="w-3 h-3 text-slate-500" />
      <span className="text-slate-400 font-medium tracking-wide" style={{ fontFamily: 'Fira Code, monospace' }}>
        {shortName}
      </span>
    </div>
  );
};

// Role badge component for Primary/Secondary designation
const RoleBadge = ({ role }) => {
  if (!role) return null;

  const isPrimary = role === 'primary';
  return (
    <span className={`
      text-[8px] px-1 py-0.5 rounded-sm font-bold tracking-wide uppercase
      ${isPrimary
        ? 'bg-blue-500/20 border border-blue-500/40 text-blue-400'
        : 'bg-slate-500/20 border border-slate-500/40 text-slate-400'
      }
    `} style={{ fontFamily: 'Orbitron, sans-serif' }}>
      {isPrimary ? 'P' : 'S'}
    </span>
  );
};

// File indicator badge
const FileIndicator = ({ type, fileName, role }) => {
  const isEcm = type === 'ECM';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`
        flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-bold
        ${isEcm
          ? 'bg-orange-500/10 border border-orange-500/30 text-orange-400'
          : 'bg-green-500/10 border border-green-500/30 text-green-400'
        }
      `} style={{ fontFamily: 'Orbitron, sans-serif' }}>
        {type}
        {role && <RoleBadge role={role} />}
      </div>
      <span
        className="text-[11px] text-slate-400 opacity-80 max-w-[100px] xl:max-w-[140px] truncate"
        style={{ fontFamily: 'Fira Code, monospace' }}
        title={fileName}
      >
        {fileName}
      </span>
    </div>
  );
};

// Navigation tab component
const NavTab = ({ tab, isActive, onClick, eventCount, faultCount }) => {
  // Determine if this tab should show a count badge
  const showEventCount = tab.id.includes('events') && eventCount > 0;
  const showFaultCount = (tab.id.includes('fault') || tab.id === 'fault-correlation') && faultCount > 0;

  return (
    <button
      onClick={() => onClick(tab.id)}
      className={`
        relative flex-none whitespace-nowrap flex items-center h-9 px-3 lg:h-10 lg:px-4 transition-all duration-300
        ${isActive
          ? 'text-green-400 border-green-500/60 bg-gradient-to-br from-green-500/20 via-green-500/5 to-transparent shadow-[0_0_25px_rgba(57,255,20,0.2),inset_0_0_30px_rgba(57,255,20,0.08)]'
          : 'text-slate-400 border-green-500/20 bg-gradient-to-br from-green-500/8 to-transparent hover:text-white hover:border-green-500/50 hover:bg-gradient-to-br hover:from-green-500/15 hover:via-green-500/3 hover:to-transparent hover:shadow-[0_0_20px_rgba(57,255,20,0.15)]'
        }
        border
      `}
      style={{
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        textShadow: isActive ? '0 0 10px rgba(57,255,20,0.8)' : 'none'
      }}
    >
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-3 h-3 bg-gradient-to-br from-green-500/60 via-green-500/20 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-3 h-3 bg-gradient-to-tl from-green-500/40 via-green-500/10 to-transparent pointer-events-none" />

      <span className="text-[9px] lg:text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: 'Orbitron, sans-serif' }}>
        {tab.label}
      </span>
      <SourceBadge source={tab.source} />

      {/* Event count badge for events tab */}
      {showEventCount && (
        <span
          className="ml-2 px-1.5 py-0.5 text-[11px] bg-black border border-green-500/30 text-green-400 rounded-sm shadow-[inset_0_0_5px_rgba(57,255,20,0.1)]"
          style={{ fontFamily: 'Fira Code, monospace' }}
        >
          {eventCount}
        </span>
      )}

      {/* Fault count badge for fault tabs */}
      {showFaultCount && (
        <span
          className="ml-2 px-1.5 py-0.5 text-[11px] bg-black border border-red-500/30 text-red-400 rounded-sm shadow-[inset_0_0_5px_rgba(255,0,0,0.1)]"
          style={{ fontFamily: 'Fira Code, monospace' }}
        >
          {faultCount}
        </span>
      )}
    </button>
  );
};

// Main header component
const AppHeader = ({
  hasEcm = false,
  hasBplt = false,
  hasPrimaryEcm = false,
  hasSecondaryEcm = false,
  ecmFileName = '',
  bpltFileName = '',
  ecmFiles = [],        // Array of { fileName, role } for multi-ECM display
  bplotFiles = [],      // Array of { fileName, role } for multi-BPLOT display
  activeTab = 'overview',
  onTabChange,
  onImport,
  onExport,
  onReportIssue,
  eventCount = 0,
  faultCount = 0,       // Combined fault count for multi-ECM
  activeProfileName = null,
  activeProfileId = null,
  activeEcmRole = null,
  onEcmRoleChange = null,
  userFields,
  userFieldsDraft,
  isUserFieldsEditing = false,
  onStartUserFieldsEdit,
  onUserFieldsDraftChange,
  onSaveUserFields,
  onCancelUserFields
}) => {
  // Determine if we have multi-ECM setup
  const hasMultiEcm = hasPrimaryEcm && hasSecondaryEcm;

  // Determine which tab configuration to use
  const getTabConfig = () => {
    if (hasMultiEcm && hasBplt) {
      return TAB_CONFIGS.fullSystem;
    }
    if (hasMultiEcm) {
      return TAB_CONFIGS.multiEcm;
    }
    if (hasEcm && hasBplt) {
      return TAB_CONFIGS.both;
    }
    if (hasEcm) {
      return TAB_CONFIGS.ecmOnly;
    }
    if (hasBplt) {
      return TAB_CONFIGS.bpltOnly;
    }
    return [];
  };

  const tabs = getTabConfig();

  const resolvedUserFields = userFields || { engineSn: '', caseFile: '', ref: '' };
  const resolvedDraft = userFieldsDraft || resolvedUserFields;
  const hasUserFields = Object.values(resolvedUserFields).some((value) => String(value || '').trim().length > 0);

  return (
    <header
      className="sticky top-0 z-40 bg-[#020617] border-b border-green-500/20 shadow-[0_1px_25px_rgba(57,255,20,0.12)]"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="max-w-[1920px] mx-auto w-full px-4 sm:px-6 py-4 flex flex-col gap-4">

        {/* Left: Branding & Status */}
        <div className="flex w-full flex-wrap items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={onImport}
            className="flex items-center gap-4 text-left hover:opacity-90 transition-opacity"
            title="Home"
          >
            {/* Logo icon */}
            <div className="relative w-11 h-11 flex items-center justify-center bg-slate-900 border border-green-500/30 rounded-sm shadow-[0_0_15px_rgba(57,255,20,0.2)]">
              <span
                className="material-symbols-outlined text-green-400 text-2xl"
                style={{ textShadow: '0 0 10px rgba(57,255,20,0.8)' }}
              >
                analytics
              </span>
              {(hasEcm || hasBplt) && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_10px_rgba(57,255,20,0.8)] border border-black" />
              )}
            </div>
            <div className="flex flex-col">
              <span
                className="text-[13px] font-black text-green-400 leading-tight tracking-wider"
                style={{ fontFamily: 'Orbitron, sans-serif', textShadow: '0 0 8px rgba(57,255,20,0.4)' }}
              >
                PLOT ANALYZER
              </span>
              <span
                className="text-[9px] text-slate-500 font-bold tracking-[0.2em]"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                {GUI_REVISION_LABEL}
              </span>
            </div>
          </button>

          {/* Separator */}
          {(hasEcm || hasBplt) && (
            <div className="hidden lg:block w-px h-6 bg-gradient-to-b from-transparent via-green-500/40 to-transparent" />
          )}

          {/* File indicators - stacked vertically */}
          {(hasEcm || hasBplt) && (
            <div className="hidden lg:block min-w-0">
              <span
                className="text-[9px] uppercase text-green-500/50 font-bold tracking-widest block mb-1"
                style={{ fontFamily: 'Fira Code, monospace' }}
              >
                Stream Source
              </span>
              <div className="flex flex-col gap-1 min-w-0">
                {/* Multi-ECM: show each file with role */}
                {hasMultiEcm && ecmFiles.length > 0 ? (
                  ecmFiles.map((file, idx) => (
                    <FileIndicator
                      key={file.id || idx}
                      type="ECM"
                      fileName={file.fileName}
                      role={file.role}
                    />
                  ))
                ) : hasEcm && (
                  <FileIndicator type="ECM" fileName={ecmFileName} />
                )}
                {/* Multi-BPLOT: show each file with role */}
                {bplotFiles.length > 1 ? (
                  bplotFiles.map((file, idx) => (
                    <FileIndicator
                      key={file.id || idx}
                      type="BPLT"
                      fileName={file.fileName}
                      role={file.role}
                    />
                  ))
                ) : hasBplt && (
                  <FileIndicator type="BPLT" fileName={bpltFileName} />
                )}
              </div>
            </div>
          )}

          {/* Active profile indicator */}
          {(hasEcm || hasBplt) && activeProfileName && (
            <>
              <div className="hidden lg:block w-px h-6 bg-gradient-to-b from-transparent via-slate-600/40 to-transparent" />
              <ProfileIndicator profileName={activeProfileName} profileId={activeProfileId} />
            </>
          )}

          {/* Active ECM context */}
          {hasMultiEcm && activeEcmRole && (
            <>
              <div className="hidden lg:block w-px h-6 bg-gradient-to-b from-transparent via-slate-600/40 to-transparent" />
              <div
                className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border border-blue-500/40 rounded"
                title="Current ECM context for Overview and Charts"
              >
                <span className="text-[10px] text-slate-500 uppercase tracking-wide" style={{ fontFamily: 'Fira Code, monospace' }}>
                  ECM View
                </span>
                {onEcmRoleChange ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onEcmRoleChange('primary')}
                      className={`h-8 px-4 rounded border font-bold text-[11px] uppercase tracking-wider transition-colors ${
                        activeEcmRole === 'primary'
                          ? 'text-blue-100 border-blue-400/70 bg-blue-500/35 shadow-[0_0_14px_rgba(59,130,246,0.35)]'
                          : 'text-slate-300 border-slate-600 hover:text-white hover:border-slate-400'
                      }`}
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      PRIMARY
                    </button>
                    <button
                      type="button"
                      onClick={() => onEcmRoleChange('secondary')}
                      className={`h-8 px-4 rounded border font-bold text-[11px] uppercase tracking-wider transition-colors ${
                        activeEcmRole === 'secondary'
                          ? 'text-orange-100 border-orange-400/70 bg-orange-500/35 shadow-[0_0_14px_rgba(249,115,22,0.35)]'
                          : 'text-slate-300 border-slate-600 hover:text-white hover:border-slate-400'
                      }`}
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      SECONDARY
                    </button>
                  </div>
                ) : (
                  <span
                    className={`font-bold text-sm uppercase tracking-wider ${
                      activeEcmRole === 'secondary' ? 'text-orange-300' : 'text-blue-300'
                    }`}
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    {activeEcmRole === 'secondary' ? 'Secondary' : 'Primary'}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          {/* Navigation Tabs */}
          {tabs.length > 0 && (
            <nav className="w-full min-w-0 xl:flex-1">
              <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto max-w-full pb-1 pr-1">
                {tabs.map(tab => (
                  <NavTab
                    key={tab.id}
                    tab={tab}
                    isActive={activeTab === tab.id}
                    onClick={onTabChange}
                    eventCount={tab.id.includes('events') ? eventCount : 0}
                    faultCount={tab.id.includes('fault') ? faultCount : 0}
                  />
                ))}
              </div>
            </nav>
          )}

          {/* Right: Actions */}
          <div className="flex w-full xl:w-auto items-center gap-2 sm:gap-3 flex-wrap xl:flex-nowrap xl:justify-end">
            {(hasEcm || hasBplt) && onExport && (
              <button
                onClick={onExport}
                className="flex items-center justify-center gap-2 flex-1 sm:flex-none h-9 px-4 lg:h-10 lg:px-5 text-slate-400 border border-green-500/25 bg-gradient-to-br from-green-500/5 to-transparent hover:text-white hover:border-green-500/60 hover:bg-gradient-to-br hover:from-green-500/12 hover:via-green-500/3 hover:to-transparent hover:shadow-[0_0_20px_rgba(57,255,20,0.15)] transition-all duration-300"
                style={{
                  clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
                }}
              >
                <Download className="w-4 h-4 text-green-400/70" />
                <span
                  className="text-[9px] lg:text-[10px] font-bold uppercase"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Export
                </span>
              </button>
            )}
            <button
              onClick={onReportIssue}
              className="flex items-center justify-center gap-2 flex-1 sm:flex-none h-9 px-4 lg:h-10 lg:px-5 text-white border border-red-500 bg-red-600/30 hover:bg-red-600/50 hover:border-red-400 shadow-[0_0_15px_rgba(255,0,0,0.5)] hover:shadow-[0_0_25px_rgba(255,0,0,0.7)] transition-all duration-300"
              style={{
                clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
              }}
            >
              <Bug className="w-4 h-4 text-red-300" />
              <span
                className="text-[9px] lg:text-[10px] font-bold uppercase"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                <span className="sm:hidden">Report</span>
                <span className="hidden sm:inline">Report Issue</span>
              </span>
            </button>
            <button
              onClick={onImport}
              className="flex items-center justify-center gap-2 flex-1 sm:flex-none h-9 px-4 lg:h-10 lg:px-5 text-white border border-green-400/50 bg-green-400/10 hover:bg-green-400/20 hover:shadow-[0_0_20px_rgba(57,255,20,0.2)] transition-all duration-300"
              style={{
                clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
              }}
            >
              <Upload className="w-4 h-4 text-green-400" />
              <span
                className="text-[9px] lg:text-[10px] font-bold uppercase"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                <span className="sm:hidden">Import</span>
                <span className="hidden sm:inline">Import New Files</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {(hasEcm || hasBplt) && (
        <div className="border-t border-green-500/10 bg-slate-900/30 px-6 py-2">
          <div className="max-w-[1920px] mx-auto w-full flex flex-wrap items-center gap-3 text-[11px]">
            <span
              className="text-[9px] uppercase tracking-[0.25em] text-green-500/60 font-bold"
              style={{ fontFamily: 'Fira Code, monospace' }}
            >
              Case Details
            </span>
            {hasUserFields && !isUserFieldsEditing && (
              <div className="flex flex-wrap items-center gap-4 text-slate-200 font-mono">
                <span className="text-slate-400">Engine SN:</span>
                <span>{resolvedUserFields.engineSn || '-'}</span>
                <span className="text-slate-400">Case File:</span>
                <span>{resolvedUserFields.caseFile || '-'}</span>
                <span className="text-slate-400">Ref #:</span>
                <span>{resolvedUserFields.ref || '-'}</span>
                <button
                  type="button"
                  onClick={onStartUserFieldsEdit}
                  className="ml-2 px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-green-500/30 text-green-400 hover:text-white hover:border-green-500/60 hover:bg-green-500/10 transition-colors"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Edit
                </button>
              </div>
            )}
            {!hasUserFields && !isUserFieldsEditing && (
              <button
                type="button"
                onClick={onStartUserFieldsEdit}
                className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-green-500/30 text-green-400 hover:text-white hover:border-green-500/60 hover:bg-green-500/10 transition-colors"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                Add Fields
              </button>
            )}
            {isUserFieldsEditing && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Engine SN"
                  value={resolvedDraft.engineSn || ''}
                  onChange={(e) => onUserFieldsDraftChange?.('engineSn', e.target.value)}
                  className="h-8 px-3 rounded border border-slate-700 bg-slate-900/70 text-slate-100 text-xs focus:outline-none focus:border-green-500/60"
                />
                <input
                  type="text"
                  placeholder="Case File"
                  value={resolvedDraft.caseFile || ''}
                  onChange={(e) => onUserFieldsDraftChange?.('caseFile', e.target.value)}
                  className="h-8 px-3 rounded border border-slate-700 bg-slate-900/70 text-slate-100 text-xs focus:outline-none focus:border-green-500/60"
                />
                <input
                  type="text"
                  placeholder="Ref #"
                  value={resolvedDraft.ref || ''}
                  onChange={(e) => onUserFieldsDraftChange?.('ref', e.target.value)}
                  className="h-8 px-3 rounded border border-slate-700 bg-slate-900/70 text-slate-100 text-xs focus:outline-none focus:border-green-500/60"
                />
                <button
                  type="button"
                  onClick={onSaveUserFields}
                  className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest border border-green-500/40 text-green-300 hover:text-white hover:border-green-500/70 hover:bg-green-500/10 transition-colors"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={onCancelUserFields}
                  className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest border border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 hover:bg-slate-700/40 transition-colors"
                  style={{ fontFamily: 'Orbitron, sans-serif' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default AppHeader;
