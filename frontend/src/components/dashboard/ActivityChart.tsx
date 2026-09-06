import React, { useState } from 'react';
import type { ActivityDataPoint } from '../../types';
import { Mail, Calendar } from 'lucide-react';

interface ActivityChartProps {
  data: ActivityDataPoint[];
  isLoading?: boolean;
  onComposeClick?: () => void;
}

export const ActivityChart: React.FC<ActivityChartProps> = ({
  data = [],
  isLoading = false,
  onComposeClick,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738] h-[360px] flex flex-col justify-between animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-4 w-36 bg-[#1f2638] rounded" />
          <div className="h-4 w-48 bg-[#1f2638] rounded" />
        </div>
        <div className="h-48 w-full bg-[#181d2c] rounded-xl" />
        <div className="h-4 w-full bg-[#1f2638] rounded" />
      </div>
    );
  }

  // Handle empty state
  const totalActivity = data.reduce((acc, curr) => acc + curr.total, 0);
  if (data.length === 0 || totalActivity === 0) {
    return (
      <div className="p-8 rounded-2xl bg-[#11141e] border border-[#212738] min-h-[360px] flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#181e2e] border border-[#273044] flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
          <Mail className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-white tracking-tight">No email activity yet</h3>
        <p className="mt-1 text-xs text-[#71788e] max-w-sm leading-relaxed">
          Create and schedule your first campaign to start tracking delivery rates, throughput, and performance.
        </p>
        {onComposeClick && (
          <button
            onClick={onComposeClick}
            className="mt-5 px-4 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20 hover:from-indigo-600 hover:to-purple-700 transition-all cursor-pointer"
          >
            Compose New Email
          </button>
        )}
      </div>
    );
  }

  // SVG Chart Metrics
  const chartHeight = 220;
  const paddingX = 40;
  const paddingY = 25;
  const usableWidth = 720;
  const usableHeight = chartHeight - paddingY * 2;

  // Maximum value for auto-scaling
  const maxVal = Math.max(
    5,
    ...data.map((d) => Math.max(d.sent, d.failed, d.scheduled, 1))
  );

  const getX = (index: number) => {
    if (data.length <= 1) return paddingX + usableWidth / 2;
    return paddingX + (index / (data.length - 1)) * (usableWidth - paddingX * 2);
  };

  const getY = (val: number) => {
    return chartHeight - paddingY - (val / maxVal) * usableHeight;
  };

  // Generate SVG path for a given metric
  const makePath = (key: 'sent' | 'failed' | 'scheduled') => {
    if (data.length === 0) return '';
    return data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[key])}`)
      .join(' ');
  };

  // Generate Area Fill path
  const makeAreaPath = (key: 'sent' | 'failed' | 'scheduled') => {
    if (data.length === 0) return '';
    const linePath = makePath(key);
    const lastX = getX(data.length - 1);
    const firstX = getX(0);
    const bottomY = chartHeight - paddingY;
    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  };

  const hoveredPoint = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="p-6 rounded-2xl bg-[#11141e] border border-[#212738] flex flex-col justify-between relative overflow-hidden">
      {/* Header & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
            <span>Sending Activity</span>
            <span className="text-[11px] font-normal text-[#71788e]">
              ({data.length} periods tracked)
            </span>
          </h3>
          <p className="text-xs text-[#71788e] mt-0.5">Throughput and delivery distribution over time</p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400/50" />
            <span className="text-[#a6adbb] font-medium text-[11px]">Sent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 shadow-xs shadow-indigo-400/50" />
            <span className="text-[#a6adbb] font-medium text-[11px]">Scheduled</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400 shadow-xs shadow-rose-400/50" />
            <span className="text-[#a6adbb] font-medium text-[11px]">Failed</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${usableWidth} ${chartHeight}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            {/* Emerald Gradient */}
            <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>

            {/* Indigo Gradient */}
            <linearGradient id="indigoGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>

            {/* Rose Gradient */}
            <linearGradient id="roseGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = chartHeight - paddingY - ratio * usableHeight;
            const val = Math.round(ratio * maxVal);
            return (
              <g key={ratio}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={usableWidth - paddingX}
                  y2={y}
                  stroke="#1c2233"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={paddingX - 10}
                  y={y + 3}
                  textAnchor="end"
                  fill="#535c75"
                  fontSize="10"
                  fontFamily="sans-serif"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area Fills */}
          <path d={makeAreaPath('scheduled')} fill="url(#indigoGradient)" />
          <path d={makeAreaPath('sent')} fill="url(#emeraldGradient)" />
          <path d={makeAreaPath('failed')} fill="url(#roseGradient)" />

          {/* Polyline Curves */}
          <path
            d={makePath('scheduled')}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={makePath('sent')}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={makePath('failed')}
            fill="none"
            stroke="#f43f5e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points & Hover Targets */}
          {data.map((d, i) => {
            const x = getX(i);
            const isHovered = hoveredIndex === i;

            return (
              <g key={d.date}>
                {/* Vertical Cursor on Hover */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingY}
                    x2={x}
                    y2={chartHeight - paddingY}
                    stroke="#434e6d"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                )}

                {/* Sent point */}
                <circle
                  cx={x}
                  cy={getY(d.sent)}
                  r={isHovered ? 5 : 3.5}
                  fill="#10b981"
                  stroke="#0b0c10"
                  strokeWidth="2"
                  className="transition-all duration-150"
                />

                {/* Invisible hover capture rect */}
                <rect
                  x={x - 18}
                  y={0}
                  width={36}
                  height={chartHeight}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {hoveredPoint && hoveredIndex !== null && (
          <div
            className="absolute z-20 pointer-events-none p-3 rounded-xl bg-[#161c2b] border border-[#2b354d] shadow-xl text-xs space-y-1 transform -translate-x-1/2 -translate-y-full transition-all"
            style={{
              left: `${(getX(hoveredIndex) / usableWidth) * 100}%`,
              top: `${Math.max(10, getY(hoveredPoint.sent) - 15)}px`,
            }}
          >
            <div className="font-semibold text-white border-b border-[#263045] pb-1 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-indigo-400" />
              <span>{hoveredPoint.date}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-emerald-400">
              <span>Sent:</span>
              <span className="font-bold">{hoveredPoint.sent}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-indigo-300">
              <span>Scheduled:</span>
              <span className="font-bold">{hoveredPoint.scheduled}</span>
            </div>
            {hoveredPoint.failed > 0 && (
              <div className="flex items-center justify-between gap-4 text-rose-400">
                <span>Failed:</span>
                <span className="font-bold">{hoveredPoint.failed}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* X Axis Labels */}
      <div className="mt-2 flex items-center justify-between text-[11px] text-[#6b7280] font-mono px-4">
        {data.map((d, i) => {
          // Display a reasonable subset of labels to prevent crowding
          const shouldShow =
            data.length <= 7 ||
            i === 0 ||
            i === Math.floor(data.length / 2) ||
            i === data.length - 1;

          return (
            <span
              key={d.date}
              className={`transition-colors ${
                hoveredIndex === i ? 'text-white font-semibold' : ''
              } ${!shouldShow ? 'invisible hidden sm:inline' : ''}`}
            >
              {d.date}
            </span>
          );
        })}
      </div>
    </div>
  );
};
