'use client';

import * as React from 'react';
import {
  AreaChart as RechartsAreaChart,
  BarChart as RechartsBarChart,
  PieChart as RechartsPieChart,
  Area,
  Bar,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const COLORS = {
  primary: '#ee3e96',
  secondary: '#a855f7',
  accent: '#f26e59',
  blue: '#2563eb',
  green: '#16a34a',
  amber: '#d97706',
  slate: '#64748b',
  pink: '#db2777',
  purple: '#9333ea',
  teal: '#0d9488',
};

const CHART_COLORS = [
  COLORS.primary,
  COLORS.blue,
  COLORS.green,
  COLORS.amber,
  COLORS.purple,
  COLORS.teal,
  COLORS.accent,
  COLORS.pink,
];

interface ChartConfig {
  [key: string]: {
    label: string;
    color: string;
  };
}

interface ChartContainerProps {
  config: ChartConfig;
  children: React.ReactNode;
  className?: string;
  height?: number;
}

// ChartContainer — wraps charts with config context for consistent theming
function ChartContainer({ config, children, className = '', height = 300 }: ChartContainerProps) {
  // Inject CSS variables for colors
  const styleVars = Object.entries(config).reduce((acc, [key, val]) => {
    acc[`--color-${key}`] = val.color;
    return acc;
  }, {} as Record<string, string>);

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height,
        ...styleVars,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

// Custom tooltip that uses chart config for labels
function ChartTooltip({ active, payload, label, config }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #f1f5f9',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 6, color: '#0f172a' }}>{label}</div>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: entry.color || config?.[entry.dataKey]?.color,
              display: 'inline-block',
            }}
          />
          <span style={{ color: '#64748b' }}>
            {config?.[entry.dataKey]?.label || entry.dataKey}:
          </span>
          <span style={{ color: '#0f172a', fontWeight: 800 }}>
            {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ChartLegendTitle — simple legend that shows colored dots + labels
function ChartLegendTitle({ config, data }: { config: ChartConfig; data?: any[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
      {Object.entries(config).map(([key, val]) => {
        const total = data?.reduce((sum, item) => sum + (Number(item[key]) || 0), 0) || 0;
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: val.color,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{val.label}</span>
            {total > 0 && (
              <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{total.toLocaleString()}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Area chart component
function AreaChart({
  data,
  config,
  xKey = 'name',
  areas,
  height = 250,
}: {
  data: any[];
  config: ChartConfig;
  xKey?: string;
  areas: { dataKey: string; color: string }[];
  height?: number;
}) {
  return (
    <div>
      <ChartLegendTitle config={config} data={data} />
      <ChartContainer config={config} height={height}>
        <RechartsAreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            {areas.map((area) => (
              <linearGradient key={area.dataKey} id={`gradient-${area.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={area.color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={area.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Tooltip content={<ChartTooltip config={config} />} />
          {areas.map((area) => (
            <Area
              key={area.dataKey}
              type="monotone"
              dataKey={area.dataKey}
              stroke={area.color}
              strokeWidth={2.5}
              fill={`url(#gradient-${area.dataKey})`}
              dot={{ r: 3, fill: area.color, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 5, fill: area.color, strokeWidth: 0 }}
            />
          ))}
        </RechartsAreaChart>
      </ChartContainer>
    </div>
  );
}

// Bar chart component
function BarChart({
  data,
  config,
  xKey = 'name',
  bars,
  height = 250,
  stacked = false,
}: {
  data: any[];
  config: ChartConfig;
  xKey?: string;
  bars: { dataKey: string; color: string; stackId?: string }[];
  height?: number;
  stacked?: boolean;
}) {
  return (
    <div>
      <ChartLegendTitle config={config} data={data} />
      <ChartContainer config={config} height={height}>
        <RechartsBarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barSize={stacked ? 20 : 24}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)}
          />
          <Tooltip content={<ChartTooltip config={config} />} />
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              radius={[4, 4, 0, 0]}
              stackId={stacked ? (bar.stackId || 'stack') : undefined}
            >
              {/* Use Cell for per-bar coloring when data items have fill property */}
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill || bar.color} />
              ))}
            </Bar>
          ))}
        </RechartsBarChart>
      </ChartContainer>
    </div>
  );
}

// Mini statistic card — small stat display for compact layout
function StatCard({
  label,
  value,
  subtitle,
  icon,
  color,
  bg,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon?: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: '1px solid #f1f5f9',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
      }}
    >
      {icon && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      )}
      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', marginTop: 1 }}>{value}</div>
        {subtitle && (
          <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginTop: 1 }}>{subtitle}</div>
        )}
      </div>
    </div>
  );
}

export { ChartContainer, AreaChart, BarChart, StatCard, ChartLegendTitle, COLORS, CHART_COLORS };
export type { ChartConfig };
