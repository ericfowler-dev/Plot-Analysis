import React, { useMemo, useRef } from 'react';
import { getNumeric, getTime } from '../../lib/chartResample';

const pickNavigatorChannel = (channels) => {
  if (channels.includes('rpm')) return 'rpm';
  if (channels.includes('RPM')) return 'RPM';
  return channels[0] || null;
};

export default function ChartTimeNavigator({
  rows = [],
  channels = [],
  fullDomain = null,
  windowDomain = null,
  onWindowChange
}) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const channel = pickNavigatorChannel(channels);

  const profile = useMemo(() => {
    if (!channel || !Array.isArray(fullDomain) || rows.length === 0) return [];
    const maxPoints = 240;
    const step = Math.max(1, Math.floor(rows.length / maxPoints));
    const points = [];
    for (let i = 0; i < rows.length; i += step) {
      const time = getTime(rows[i]);
      const value = getNumeric(rows[i], channel);
      if (time === null || value === null) continue;
      points.push({ time, value });
    }
    return points;
  }, [rows, channel, fullDomain]);

  if (!fullDomain || profile.length < 2) return null;

  const [fullStart, fullEnd] = fullDomain;
  const span = fullEnd - fullStart;
  if (!(span > 0)) return null;

  const values = profile.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 1000;
  const height = 56;
  const path = profile.map((point, index) => {
    const x = ((point.time - fullStart) / span) * width;
    const y = height - 4 - ((point.value - min) / range) * (height - 8);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const windowStart = windowDomain?.[0] ?? fullStart;
  const windowEnd = windowDomain?.[1] ?? fullEnd;
  const x1 = ((windowStart - fullStart) / span) * width;
  const x2 = ((windowEnd - fullStart) / span) * width;

  const timeFromClientX = (clientX) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return fullStart;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return fullStart + ratio * span;
  };

  const commitWindow = (start, end) => {
    if (!onWindowChange) return;
    onWindowChange([Math.min(start, end), Math.max(start, end)]);
  };

  const onPointerDown = (event) => {
    event.preventDefault();
    const time = timeFromClientX(event.clientX);
    const handleSlop = span * 0.012;
    let mode = 'move';
    if (Math.abs(time - windowStart) <= handleSlop) mode = 'start';
    else if (Math.abs(time - windowEnd) <= handleSlop) mode = 'end';
    else if (time < windowStart || time > windowEnd) {
      const currentSpan = windowEnd - windowStart;
      commitWindow(time - currentSpan / 2, time + currentSpan / 2);
      mode = 'move';
    }
    dragRef.current = { mode, origin: time, start: windowStart, end: windowEnd };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    const time = timeFromClientX(event.clientX);
    const { mode, origin, start, end } = dragRef.current;
    const delta = time - origin;
    if (mode === 'start') commitWindow(start + delta, end);
    else if (mode === 'end') commitWindow(start, end + delta);
    else commitWindow(start + delta, end + delta);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-14 cursor-ew-resize"
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <path d={path} fill="none" stroke="#64748b" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <rect x="0" y="0" width={Math.max(0, x1)} height={height} fill="rgba(2,6,23,0.55)" />
        <rect x={x2} y="0" width={Math.max(0, width - x2)} height={height} fill="rgba(2,6,23,0.55)" />
        <rect x={x1} y="1" width={Math.max(2, x2 - x1)} height={height - 2} fill="rgba(34,197,94,0.12)" stroke="#34d399" strokeWidth="1.5" />
        <rect x={x1 - 3} y="8" width="6" height={height - 16} rx="1" fill="#34d399" />
        <rect x={x2 - 3} y="8" width="6" height={height - 16} rx="1" fill="#34d399" />
      </svg>
    </div>
  );
}
