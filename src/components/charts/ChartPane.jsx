import React, { useRef } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, ReferenceLine, ReferenceArea
} from 'recharts';
import { getDecimalPlaces } from '../../lib/bplotThresholds';
import { formatChartTick, isDiscreteChannel } from '../../lib/chartResample';
import { CURSOR_A_COLOR, CURSOR_B_COLOR } from '../../lib/chartCursors';
import ChartErrorBoundary from './ChartErrorBoundary';
import ChartValueTooltip from './ChartValueTooltip';

const safeToFixed = (value, decimals, fallback = '') => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return value.toFixed(decimals);
};

export default function ChartPane({
  pane,
  data,
  series,
  axis,
  axes = null,
  channelToAxis = null,
  xDomain,
  zoomedDomain,
  showXAxis = true,
  cursorTime,
  cursorA,
  cursorB,
  refAreaLeft,
  refAreaRight,
  thresholdLines = [],
  fileBoundaries = [],
  shouldShowFileBoundaries = false,
  selectedAlert = null,
  selectedAlertTimeOffset = 0,
  highlightedChannel = null,
  seriesValueLookup,
  onMouseDown,
  onMouseMove,
  onMouseUp
}) {
  const axisList = Array.isArray(axes) && axes.length
    ? axes
    : [{
      id: axis?.id || 'yDefault',
      label: pane?.label || axis?.label || '',
      orientation: 'left',
      domain: axis?.domain || ['auto', 'auto'],
      decimals: axis?.decimals ?? getDecimalPlaces(pane?.channels?.[0])
    }];
  const fallbackAxisId = axisList[0]?.id || 'yDefault';
  const axisForChannel = (channel) => channelToAxis?.[channel] || fallbackAxisId;
  const paneChannels = pane?.channels || series.map((item) => item.channel);
  const paneThresholds = thresholdLines.filter((line) => paneChannels.includes(line.channel));
  const paneAlert = selectedAlert && paneChannels.includes(selectedAlert.channel) ? selectedAlert : selectedAlert;
  const chartWrapRef = useRef(null);

  return (
    <div className="min-h-0 h-full flex flex-col" style={{ flex: pane?.flex || 1 }}>
      {series.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-1 max-h-14 overflow-y-auto">
          {series.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1 text-[10px] whitespace-nowrap" style={{ color: item.color }}>
              <span
                className="inline-block w-3 h-0 border-t-2"
                style={{
                  borderColor: item.color,
                  borderStyle: item.strokeDasharray ? 'dashed' : 'solid'
                }}
              />
              {item.name}
            </span>
          ))}
        </div>
      )}
      <div ref={chartWrapRef} className="flex-1 min-h-[240px]">
        <ChartErrorBoundary fallbackHeight="100%">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart
              data={data}
              margin={{ top: 10, right: 16, left: 8, bottom: 4 }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="Time"
                stroke="#64748b"
                fontSize={12}
                type="number"
                domain={xDomain}
                allowDataOverflow={!!zoomedDomain}
                tickFormatter={formatChartTick}
                hide={!showXAxis}
              />
              {axisList.map((item, index) => (
                <YAxis
                  key={item.id}
                  yAxisId={item.id}
                  orientation={item.orientation || (index % 2 === 0 ? 'left' : 'right')}
                  stroke={index === 0 ? '#64748b' : '#94a3b8'}
                  fontSize={12}
                  width={52}
                  domain={item.domain || ['auto', 'auto']}
                  tickFormatter={(value) => safeToFixed(value, item.decimals ?? 1, '')}
                  label={item.label ? {
                    value: item.label,
                    angle: (item.orientation || (index % 2 === 0 ? 'left' : 'right')) === 'left' ? -90 : 90,
                    position: (item.orientation || (index % 2 === 0 ? 'left' : 'right')) === 'left' ? 'insideLeft' : 'insideRight',
                    style: { textAnchor: 'middle', fill: '#64748b', fontSize: 10 }
                  } : undefined}
                />
              ))}
              <Tooltip
                cursor={false}
                isAnimationActive={false}
                offset={36}
                allowEscapeViewBox={{ x: true, y: true }}
                wrapperStyle={{ zIndex: 80, pointerEvents: 'none', visibility: 'hidden' }}
                content={(props) => (
                  <ChartValueTooltip
                    {...props}
                    chartSeries={series}
                    seriesValueLookup={seriesValueLookup}
                    shouldShowFileBoundaries={shouldShowFileBoundaries}
                    cursorTime={cursorTime}
                    containerRef={chartWrapRef}
                  />
                )}
              />
              {series.map((item) => (
                <Line
                  key={item.key}
                  yAxisId={axisForChannel(item.channel)}
                  type={isDiscreteChannel(item.channel) ? 'stepAfter' : 'linear'}
                  dataKey={item.key}
                  stroke={item.color}
                  dot={false}
                  strokeDasharray={item.strokeDasharray}
                  strokeWidth={highlightedChannel === item.channel ? 3.5 : 2}
                  name={item.name}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
              {Number.isFinite(cursorTime) && (
                <ReferenceLine x={cursorTime} yAxisId={fallbackAxisId} stroke="#e2e8f0" strokeOpacity={0.35} strokeDasharray="3 3" />
              )}
              {Number.isFinite(cursorA) && (
                <ReferenceLine x={cursorA} yAxisId={fallbackAxisId} stroke={CURSOR_A_COLOR} strokeWidth={1.5} />
              )}
              {Number.isFinite(cursorB) && (
                <ReferenceLine x={cursorB} yAxisId={fallbackAxisId} stroke={CURSOR_B_COLOR} strokeWidth={1.5} />
              )}
              {Number.isFinite(cursorA) && Number.isFinite(cursorB) && (
                <ReferenceArea
                  x1={Math.min(cursorA, cursorB)}
                  x2={Math.max(cursorA, cursorB)}
                  yAxisId={fallbackAxisId}
                  fill="#64748b"
                  fillOpacity={0.08}
                  ifOverflow="hidden"
                />
              )}
              {paneThresholds.map((line) => (
                <ReferenceLine
                  key={line.id}
                  y={line.y}
                  yAxisId={line.yAxisId || axisForChannel(line.channel)}
                  stroke={line.level === 'critical' ? '#ef4444' : '#f59e0b'}
                  strokeDasharray={line.level === 'critical' ? '4 2' : '6 4'}
                  strokeOpacity={0.7}
                  ifOverflow="hidden"
                  label={{
                    value: line.label,
                    fill: line.level === 'critical' ? '#fca5a5' : '#fcd34d',
                    fontSize: 9,
                    position: 'insideBottomRight'
                  }}
                />
              ))}
              {shouldShowFileBoundaries && fileBoundaries.map((boundary, idx) => (
                idx > 0 && (
                  <ReferenceLine
                    key={`file-boundary-${boundary.fileId}`}
                    x={boundary.startTime}
                    yAxisId={fallbackAxisId}
                    stroke="#22c55e"
                    strokeDasharray="5 5"
                    strokeWidth={2}
                  />
                )
              ))}
              {paneAlert && paneAlert.startTime !== undefined && paneAlert.endTime !== undefined && (
                <ReferenceArea
                  x1={paneAlert.startTime - (paneAlert.minDuration || 0) + selectedAlertTimeOffset}
                  x2={paneAlert.endTime + selectedAlertTimeOffset}
                  yAxisId={axisForChannel(paneAlert.channel) || fallbackAxisId}
                  stroke={paneAlert.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                  fill={paneAlert.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                  fillOpacity={0.12}
                  ifOverflow="hidden"
                />
              )}
              {refAreaLeft !== null && refAreaRight !== null && (
                <ReferenceArea
                  x1={refAreaLeft}
                  x2={refAreaRight}
                  yAxisId={fallbackAxisId}
                  strokeOpacity={0.3}
                  fill="#22c55e"
                  fillOpacity={0.15}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartErrorBoundary>
      </div>
    </div>
  );
}
