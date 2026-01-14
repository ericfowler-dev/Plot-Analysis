import React from 'react';
import { Upload, FileSpreadsheet, Download } from 'lucide-react';

// =============================================================================
// BMS DATA ANALYZER - TRON-STYLE HEADER
// Handles file-type-aware navigation tabs based on loaded files
// =============================================================================

// Tab configurations based on file types loaded
const TAB_CONFIGS = {
  // ECM only: Overview - Charts - Raw
  ecmOnly: [
    { id: 'overview', label: 'Overview', source: null },
    { id: 'charts', label: 'Charts', source: null },
    { id: 'raw', label: 'Raw', source: null }
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
    { id: 'events-bplt', label: 'Events', source: 'BPLT' },
    { id: 'raw-ecm', label: 'Raw', source: 'ECM' }
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

// File indicator badge
const FileIndicator = ({ type, fileName }) => {
  const isEcm = type === 'ECM';
  return (
    <div className="flex items-center gap-2">
      <div className={`
        flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10px] font-bold
        ${isEcm
          ? 'bg-orange-500/10 border border-orange-500/30 text-orange-400'
          : 'bg-green-500/10 border border-green-500/30 text-green-400'
        }
      `} style={{ fontFamily: 'Orbitron, sans-serif' }}>
        {type}
      </div>
      <span className="text-[11px] text-slate-400 opacity-80" style={{ fontFamily: 'Fira Code, monospace' }}>
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
        relative flex items-center h-10 px-5 transition-all duration-300
        ${isActive
          ? 'text-cyan-400 border-cyan-500/60 bg-gradient-to-br from-cyan-500/20 via-cyan-500/5 to-transparent shadow-[0_0_25px_rgba(0,242,255,0.2),inset_0_0_30px_rgba(0,242,255,0.08)]'
          : 'text-slate-400 border-cyan-500/20 bg-gradient-to-br from-cyan-500/8 to-transparent hover:text-white hover:border-cyan-500/50 hover:bg-gradient-to-br hover:from-cyan-500/15 hover:via-cyan-500/3 hover:to-transparent hover:shadow-[0_0_20px_rgba(0,242,255,0.15)]'
        }
        border
      `}
      style={{
        clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        textShadow: isActive ? '0 0 10px rgba(0,242,255,0.8)' : 'none'
      }}
    >
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-3 h-3 bg-gradient-to-br from-cyan-500/60 via-cyan-500/20 to-transparent pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-3 h-3 bg-gradient-to-tl from-cyan-500/40 via-cyan-500/10 to-transparent pointer-events-none" />

      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: 'Orbitron, sans-serif' }}>
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
  eventCount = 0
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
      className="bg-[#020617] border-b border-cyan-500/20 shadow-[0_1px_25px_rgba(0,242,255,0.12)]"
      style={{ fontFamily: 'Inter, sans-serif' }}
    >
      <div className="max-w-[1920px] mx-auto flex flex-col xl:flex-row items-center justify-between px-6 py-4 gap-6">

        {/* Left: Branding & Status */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            {/* Logo icon */}
            <div className="relative w-11 h-11 flex items-center justify-center bg-slate-900 border border-cyan-500/30 rounded-sm shadow-[0_0_15px_rgba(0,242,255,0.2)]">
              <span
                className="material-symbols-outlined text-cyan-400 text-2xl"
                style={{ textShadow: '0 0 10px rgba(0,242,255,0.8)' }}
              >
                analytics
              </span>
              {(hasEcm || hasBplt) && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_10px_rgba(57,255,20,0.8)] border border-black" />
              )}
            </div>
            <div className="flex flex-col">
              <span
                className="text-[13px] font-black text-cyan-400 leading-tight tracking-wider"
                style={{ fontFamily: 'Orbitron, sans-serif', textShadow: '0 0 8px rgba(0,242,255,0.4)' }}
              >
                PLOT ANALYZER
              </span>
              <span
                className="text-[9px] text-slate-500 font-bold tracking-[0.2em]"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                DATA ANALYSIS v1.2.0
              </span>
            </div>
          </div>

          {/* Separator */}
          {(hasEcm || hasBplt) && (
            <div className="hidden xl:block w-px h-6 bg-gradient-to-b from-transparent via-cyan-500/40 to-transparent" />
          )}

          {/* File indicators */}
          {(hasEcm || hasBplt) && (
            <div className="hidden xl:flex flex-col gap-1.5">
              <span
                className="text-[9px] uppercase text-cyan-500/50 font-bold tracking-widest"
                style={{ fontFamily: 'Fira Code, monospace' }}
              >
                Stream Source
              </span>
              <div className="flex items-center gap-4">
                {hasEcm && <FileIndicator type="ECM" fileName={ecmFileName} />}
                {hasBplt && <FileIndicator type="BPLT" fileName={bpltFileName} />}
              </div>
            </div>
          )}
        </div>

        {/* Center: Navigation Tabs */}
        {tabs.length > 0 && (
          <nav className="flex items-center">
            <div className="flex items-center gap-1.5 flex-wrap justify-center">
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
        <div className="flex items-center gap-3">
          {(hasEcm || hasBplt) && onExport && (
            <button
              onClick={onExport}
              className="flex items-center gap-2 h-10 px-5 text-slate-400 border border-cyan-500/25 bg-gradient-to-br from-cyan-500/5 to-transparent hover:text-white hover:border-cyan-500/60 hover:bg-gradient-to-br hover:from-cyan-500/12 hover:via-cyan-500/3 hover:to-transparent hover:shadow-[0_0_20px_rgba(0,242,255,0.15)] transition-all duration-300"
              style={{
                clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
              }}
            >
              <Download className="w-4 h-4 text-cyan-400/70" />
              <span
                className="text-[10px] font-bold uppercase"
                style={{ fontFamily: 'Orbitron, sans-serif' }}
              >
                Export
              </span>
            </button>
          )}
          <button
            onClick={onImport}
            className="flex items-center gap-2 h-10 px-5 text-white border border-cyan-400/50 bg-cyan-400/10 hover:bg-cyan-400/20 hover:shadow-[0_0_20px_rgba(0,242,255,0.2)] transition-all duration-300"
            style={{
              clipPath: 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)'
            }}
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span
              className="text-[10px] font-bold uppercase"
              style={{ fontFamily: 'Orbitron, sans-serif' }}
            >
              Import
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
