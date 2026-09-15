import {
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, ReferenceLine, ReferenceArea
} from 'recharts';
import { BPLOT_PARAMETERS, getDecimalPlaces } from '../../lib/bplotThresholds';
import { formatChartTick, isDiscreteChannel } from '../../lib/chartResample';
import { CURSOR_A_COLOR, CURSOR_B_COLOR } from '../../lib/chartCursors';
import ChartErrorBoundary from './ChartErrorBoundary';
import ChartValueTooltip from './ChartValueTooltip';

const safeToFixed = (value, decimals, fallback = '') => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return value.toFixed(decimals);
};

const getSeverityLabel = (severity, category) => {
  if (category === 'signal_quality') return 'Sensor';
  if (severity === 'critical') return 'Critical';
  if (severity === 'info') return 'Info';
  return 'Warning';
};

const getAlertDisplayName = (alert) => {
  const fallback = alert?.channel || 'Anomaly';
  if (!alert?.name) return fallback;
  const cleaned = alert.name.replace(/^\s*(critical|warning|info)\s*[:-]?\s*/i, '').trim();
  return cleaned || fallback;
};

export default function ChartPane({
  pane,
  data,
  series,
  axis,
  xDomain,
  zoomedDomain,
  showXAxis,
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
  const yAxisId = axis?.id || 'yDefault';
  const paneThresholds = thresholdLines.filter((line) => pane.channels.includes(line.channel));
  const paneAlert = selectedAlert && pane.channels.includes(selectedAlert.channel) ? selectedAlert : null;

  return (
    <div className="min-h-0" style={{ flex: pane.flex || 1 }}>
      <div className="h-full min-h-[96px]">
        <ChartErrorBoundary fallbackHeight="100%">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart
              data={data}
              margin={{ top: 8, right: 12, left: 4, bottom: showXAxis ? 4 : -8 }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="Time"
                stroke="#64748b"
                fontSize={11}
                type="number"
                domain={xDomain}
                allowDataOverflow={!!zoomedDomain}
                tickFormatter={formatChartTick}
                hide={!showXAxis}
              />
              <YAxis
                yAxisId={yAxisId}
                orientation="left"
                stroke="#64748b"
                fontSize={11}
                width={52}
                domain={axis?.domain || ['auto', 'auto']}
                tickFormatter={(value) => safeToFixed(value, axis?.decimals ?? getDecimalPlaces(pane.channels[0]), '')}
                label={{
                  value: pane.label,
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle', fill: '#64748b', fontSize: 10 }
                }}
              />
              <Tooltip
                cursor={false}
                content={(props) => (
                  <ChartValueTooltip
                    {...props}
                    chartSeries={series}
                    seriesValueLookup={seriesValueLookup}
                    shouldShowFileBoundaries={shouldShowFileBoundaries}
                    cursorTime={cursorTime}
                  />
                )}
              />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 10, paddingTop: 0 }} />
              {series.map((item) => (
                <Line
                  key={item.key}
                  yAxisId={yAxisId}
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
                <ReferenceLine x={cursorTime} yAxisId={yAxisId} stroke="#e2e8f0" strokeOpacity={0.35} strokeDasharray="3 3" />
              )}
              {Number.isFinite(cursorA) && (
                <ReferenceLine x={cursorA} yAxisId={yAxisId} stroke={CURSOR_A_COLOR} strokeWidth={1.5} />
              )}
              {Number.isFinite(cursorB) && (
                <ReferenceLine x={cursorB} yAxisId={yAxisId} stroke={CURSOR_B_COLOR} strokeWidth={1.5} />
              )}
              {Number.isFinite(cursorA) && Number.isFinite(cursorB) && (
                <ReferenceArea
                  x1={Math.min(cursorA, cursorB)}
                  x2={Math.max(cursorA, cursorB)}
                  yAxisId={yAxisId}
                  fill="#64748b"
                  fillOpacity={0.08}
                  ifOverflow="hidden"
                />
              )}
              {paneThresholds.map((line) => (
                <ReferenceLine
                  key={line.id}
                  y={line.y}
                  yAxisId={yAxisId}
                  stroke={line.level === 'critical' ? '#ef4444' : '#f59e0b'}
                  strokeDasharray={line.level === 'critical' ? '4 2' : '6 4'}
                  strokeOpacity={0.7}
                  ifOverflow="hidden"
                  label={{
                    value: `${BPLOT_PARAMETERS[line.channel]?.name || line.channel} ${line.label}`,
                    fill: line.level === 'critical' ? '#fca5a5' : '#fcd34d',
                    fontSize: 10,
                    position: 'insideTopRight'
                  }}
                />
              ))}
              {shouldShowFileBoundaries && fileBoundaries.map((boundary, idx) => (
                idx > 0 && (
                  <ReferenceLine
                    key={`file-boundary-${boundary.fileId}`}
                    x={boundary.startTime}
                    yAxisId={yAxisId}
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
                  yAxisId={yAxisId}
                  stroke={paneAlert.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                  fill={paneAlert.severity === 'critical' ? '#ef4444' : '#f59e0b'}
                  fillOpacity={0.08}
                  ifOverflow="extendDomain"
                  label={{
                    value: `${getSeverityLabel(paneAlert.severity, paneAlert.category)}: ${getAlertDisplayName(paneAlert)}`,
                    position: 'insideTopLeft',
                    fill: '#ffffff',
                    fontSize: 11
                  }}
                />
              )}
              {refAreaLeft !== null && refAreaRight !== null && (
                <ReferenceArea
                  x1={refAreaLeft}
                  x2={refAreaRight}
                  yAxisId={yAxisId}
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
