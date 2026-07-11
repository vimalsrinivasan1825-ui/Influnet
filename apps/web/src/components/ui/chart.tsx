"use client";

import * as React from "react";
import {
  AreaChart as RechartsAreaChart,
  BarChart as RechartsBarChart,
  PieChart as RechartsPieChart,
  LineChart as RechartsLineChart,
  Area,
  Bar,
  Pie,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

/** Shared categorical palette, aligned with the design tokens. */
const CHART_COLORS = [
  "var(--brand)",
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#8b5cf6",
  "#0d9488",
  "#f26e59",
  "#db2777",
];

interface ChartConfig {
  [key: string]: { label: string; color: string };
}

const axisTick = { fontSize: 11, fontWeight: 600, fill: "#94a3b8" } as const;
const gridStroke = "#eef0f4";

function fmtCompact(v: number) {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `${v}`;
}

/**
 * Thin ResponsiveContainer wrapper. Recharts' own mount animation is disabled
 * on the marks below (it can stay stuck clipped when the chart mounts inside a
 * CSS entrance animation); the card's `ds-rise` provides the motion instead.
 */
function AutoResponsive({
  height,
  children,
}: {
  height: number | `${number}%`;
  children: React.ReactElement;
}) {
  return (
    <ResponsiveContainer width="100%" height={height} minWidth={0}>
      {children}
    </ResponsiveContainer>
  );
}

function ChartTooltip({ active, payload, label, config, prefix }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5 shadow-[var(--shadow-pop)]">
      {label != null && (
        <div className="mb-1.5 text-xs font-bold text-content">{label}</div>
      )}
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <span
            className="size-2 rounded-full"
            style={{ background: entry.color || entry.payload?.fill }}
          />
          <span className="text-content-soft">
            {config?.[entry.dataKey]?.label || entry.name || entry.dataKey}
          </span>
          <span className="ml-auto pl-3 font-bold text-content tabular-nums">
            {prefix}
            {typeof entry.value === "number"
              ? entry.value.toLocaleString()
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function AreaChart({
  data,
  config,
  xKey = "name",
  areas,
  height = 240,
  prefix,
}: {
  data: any[];
  config: ChartConfig;
  xKey?: string;
  areas: { dataKey: string; color?: string }[];
  height?: number;
  prefix?: string;
}) {
  const gid = React.useId().replace(/:/g, "");
  return (
    <AutoResponsive height={height}>
      <RechartsAreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          {areas.map((a, i) => {
            const color = a.color ?? CHART_COLORS[i % CHART_COLORS.length];
            return (
              <linearGradient key={a.dataKey} id={`${gid}-${a.dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={false} dy={4} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={38} tickFormatter={fmtCompact} />
        <Tooltip cursor={{ stroke: "#e3e6ec" }} content={<ChartTooltip config={config} prefix={prefix} />} />
        {areas.map((a, i) => {
          const color = a.color ?? CHART_COLORS[i % CHART_COLORS.length];
          return (
            <Area
              key={a.dataKey}
              type="monotone"
              dataKey={a.dataKey}
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gid}-${a.dataKey})`}
              dot={false}
              isAnimationActive={false}
              activeDot={{ r: 5, fill: color, strokeWidth: 2, stroke: "#fff" }}
            />
          );
        })}
      </RechartsAreaChart>
    </AutoResponsive>
  );
}

function BarChart({
  data,
  config,
  xKey = "name",
  bars,
  height = 240,
  stacked = false,
  prefix,
}: {
  data: any[];
  config: ChartConfig;
  xKey?: string;
  bars: { dataKey: string; color?: string; stackId?: string }[];
  height?: number;
  stacked?: boolean;
  prefix?: string;
}) {
  return (
    <AutoResponsive height={height}>
      <RechartsBarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={false} dy={4} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} width={38} tickFormatter={fmtCompact} />
        <Tooltip cursor={{ fill: "rgba(148,163,184,0.08)" }} content={<ChartTooltip config={config} prefix={prefix} />} />
        {bars.map((bar, bi) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            radius={[6, 6, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
            stackId={stacked ? bar.stackId || "stack" : undefined}
          >
            {data.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.fill || bar.color || CHART_COLORS[bi % CHART_COLORS.length]}
              />
            ))}
          </Bar>
        ))}
      </RechartsBarChart>
    </AutoResponsive>
  );
}

/** Donut with a centered total; `data` items carry name/value/fill. */
function DonutChart({
  data,
  height = 240,
  centerLabel,
  centerValue,
  prefix,
}: {
  data: { name: string; value: number; fill?: string }[];
  height?: number;
  centerLabel?: string;
  centerValue?: React.ReactNode;
  prefix?: string;
}) {
  const total =
    centerValue ?? data.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  return (
    <div className="relative" style={{ height }}>
      <AutoResponsive height="100%">
        <RechartsPieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill || CHART_COLORS[idx % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip prefix={prefix} />} />
        </RechartsPieChart>
      </AutoResponsive>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold tracking-tight text-content tabular-nums">
          {prefix}
          {typeof total === "number" ? total.toLocaleString() : total}
        </span>
        {centerLabel && (
          <span className="text-[0.625rem] font-bold uppercase tracking-[0.08em] text-content-muted">
            {centerLabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Compact inline trend line, no axes — for stat tiles. */
function Sparkline({
  data,
  dataKey = "value",
  color = "var(--brand)",
  height = 40,
}: {
  data: any[];
  dataKey?: string;
  color?: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsLineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}

/** Legend chips with per-series totals. */
function ChartLegend({
  items,
}: {
  items: { label: string; color: string; value?: React.ReactNode }[];
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: item.color }} />
          <span className="text-xs font-medium text-content-soft">{item.label}</span>
          {item.value != null && (
            <span className="text-xs font-bold text-content tabular-nums">
              {item.value}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export {
  AreaChart,
  BarChart,
  DonutChart,
  Sparkline,
  ChartLegend,
  CHART_COLORS,
};
export type { ChartConfig };
