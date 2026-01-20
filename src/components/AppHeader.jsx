import React from 'react';
import { Upload, FileSpreadsheet, Download, Bug, Settings } from 'lucide-react';

// =============================================================================
// BMS DATA ANALYZER - TRON-STYLE HEADER
// Handles file-type-aware navigation tabs based on loaded files
// =============================================================================

// Tab configurations based on file types loaded
const TAB_CONFIGS = {
  // ECM only: Overview - Charts - Raw
  ecmOnly: [
    { id: 'overview', label: 'Overview', source: null },
    { id: 'charts', label: 'Charts', source: null }
  ],
  // BPLT only: Overview - Charts - Channels - Events
  bpltOnly: [
    { id: 'overview', label: 'Overview', source: null },
    { id: 'charts', label: 'Charts', source: null },
    { id: 'channels', label: 'Channels', source: null },
    { id: 'events', label: 'Events', source: null }
  ],
  // Both: Overview (ECM) - Overview (BPLT) - Charts (ECM) - Charts (BPLT) - Channels (BPLT) - Events (BPLT) - Raw (ECM)
  both: [
    { id: 'overview-ecm', label: 'Overview', source: 'ECM' },
    { id: 'overview-bplt', label: 'Overview', source: 'BPLT' },
    { id: 'charts-ecm', label: 'Charts', source: 'ECM' },
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

// File indicator badge
const FileIndicator = ({ type, fileName }) => {
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
const NavTab = ({ tab, isActive, onClick, eventCount }) => {
  return (
    <button
      onClick={() => onClick(tab.id)}
      className={`
        relative flex items-center h-9 px-3 lg:h-10 lg:px-4 transition-all duration-300
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
      {tab.id.includes('events') && eventCount > 0 && (
        <span
          className="ml-2 px-1.5 py-0.5 text-[11px] bg-black border border-green-500/30 text-green-400 rounded-sm shadow-[inset_0_0_5px_rgba(57,255,20,0.1)]"
          style={{ fontFamily: 'Fira Code, monospace' }}
        >
          {eventCount}
        </span>
      )}
    </button>
  );
};

// Main header component
const AppHeader = ({
  hasEcm = false,
  hasBplt = false,
  ecmFileName = '',
  bpltFileName = '',
  activeTab = 'overview',
  onTabChange,
  onImport,
  onExport,
  onReportIssue,
  eventCount = 0,
  activeProfileName = null,
  activeProfileId = null
}) => {
  // Determine which tab configuration to use
  const getTabConfig = () => {
    if (hasEcm && hasBplt) return TAB_CONFIGS.both;
    if (hasEcm) return TAB_CONFIGS.ecmOnly;
    if (hasBplt) return TAB_CONFIGS.bpltOnly;
    return [];
  };

  const tabs = getTabConfig();

  return (
    <header
      className="bg-[#020617] border-b border-green-500/20 shadow-[0_1px_25px_rgba(57,255,20,0.12)]"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="max-w-[1920px] mx-auto w-full flex flex-col lg:flex-row items-center justify-between px-6 py-4 gap-4">

        {/* Left: Branding & Status */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-4">
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
                DATA ANALYSIS v1.4.5
              </span>
            </div>
          </div>

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
                {hasEcm && <FileIndicator type="ECM" fileName={ecmFileName} />}
                {hasBplt && <FileIndicator type="BPLT" fileName={bpltFileName} />}
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
        </div>

        {/* Navigation Tabs */}
        {tabs.length > 0 && (
          <nav className="flex items-center w-full lg:flex-1 lg:min-w-0 lg:ml-6">
            <div className="flex items-center gap-1.5 flex-nowrap justify-start overflow-hidden max-w-full">
              {tabs.map(tab => (
                <NavTab
                  key={tab.id}
                  tab={tab}
                  isActive={activeTab === tab.id}
                  onClick={onTabChange}
                  eventCount={tab.id.includes('events') ? eventCount : 0}
                />
              ))}
            </div>
          </nav>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {(hasEcm || hasBplt) && onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-2 h-9 px-4 lg:h-10 lg:px-5 text-slate-400 border border-green-500/25 bg-gradient-to-br from-green-500/5 to-transparent hover:text-white hover:border-green-500/60 hover:bg-gradient-to-br hover:from-green-500/12 hover:via-green-500/3 hover:to-transparent hover:shadow-[0_0_20px_rgba(57,255,20,0.15)] transition-all duration-300"
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
            className="flex items-center gap-2 h-9 px-4 lg:h-10 lg:px-5 text-white border border-red-500 bg-red-600/30 hover:bg-red-600/50 hover:border-red-400 shadow-[0_0_15px_rgba(255,0,0,0.5)] hover:shadow-[0_0_25px_rgba(255,0,0,0.7)] transition-all duration-300"
            style={{
              clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
            }}
          >
            <Bug className="w-4 h-4 text-red-300" />
            <span
              className="text-[9px] lg:text-[10px] font-bold uppercase"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Report Issue
            </span>
          </button>
          <button
            onClick={onImport}
            className="flex items-center gap-2 h-9 px-4 lg:h-10 lg:px-5 text-white border border-green-400/50 bg-green-400/10 hover:bg-green-400/20 hover:shadow-[0_0_20px_rgba(57,255,20,0.2)] transition-all duration-300"
            style={{
              clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
            }}
          >
            <Upload className="w-4 h-4 text-green-400" />
            <span
              className="text-[9px] lg:text-[10px] font-bold uppercase"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Import New Files
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
