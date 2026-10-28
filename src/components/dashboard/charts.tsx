"use client";

import { ResponsiveBar } from "@nivo/bar";
import { ResponsiveTimeRange } from "@nivo/calendar";
import { ResponsivePie } from "@nivo/pie";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { STATUS_COLORS, type JobStatus } from "@/lib/constants";

function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  const text = dark ? "#cbd5e1" : "#475569";
  const grid = dark ? "#1e293b" : "#e2e8f0";
  return {
    dark,
    theme: {
      text: { fill: text, fontSize: 11 },
      axis: { ticks: { text: { fill: text, fontSize: 11 } } },
      grid: { line: { stroke: grid } },
      legends: { text: { fill: text } },
      tooltip: {
        container: {
          background: dark ? "#0f172a" : "#ffffff",
          color: dark ? "#f8fafc" : "#0f172a",
          fontSize: 12,
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        },
      },
    },
  };
}

export function WeeklyChart({ data }: { data: { week: string; applied: number; saved: number }[] }) {
  const { theme } = useChartTheme();
  const max = Math.max(1, ...data.map((d) => Math.max(d.applied, d.saved)));
  return (
    <div className="h-64" role="img" aria-label="Jobs saved and applied per week for the last 12 weeks">
      <ResponsiveBar
        data={data}
        keys={["saved", "applied"]}
        indexBy="week"
        groupMode="grouped"
        margin={{ top: 10, right: 10, bottom: 40, left: 32 }}
        padding={0.3}
        innerPadding={2}
        colors={["#a5b4fc", "#4f46e5"]}
        borderRadius={3}
        enableLabel={false}
        axisBottom={{ tickSize: 0, tickPadding: 8, tickRotation: -35 }}
        axisLeft={{ tickSize: 0, tickPadding: 6, tickValues: max <= 5 ? max : 5 }}
        gridYValues={max <= 5 ? max : 5}
        theme={theme}
        legends={[]}
        tooltipLabel={(d) => `${d.id === "applied" ? "Applied" : "Saved"} · week of ${d.indexValue}`}
      />
    </div>
  );
}

export function StatusDonut({
  data,
}: {
  data: { status: string; label: string; count: number }[];
}) {
  const { theme } = useChartTheme();
  return (
    <div className="h-64" role="img" aria-label="Jobs by status">
      <ResponsivePie
        data={data.map((d) => ({
          id: d.label,
          label: d.label,
          value: d.count,
          color: STATUS_COLORS[d.status as JobStatus] ?? "#94a3b8",
        }))}
        colors={{ datum: "data.color" }}
        margin={{ top: 16, right: 16, bottom: 16, left: 16 }}
        innerRadius={0.6}
        padAngle={1.5}
        cornerRadius={3}
        enableArcLinkLabels={false}
        arcLabelsSkipAngle={18}
        arcLabelsTextColor="#ffffff"
        borderWidth={0}
        theme={theme}
        activeOuterRadiusOffset={4}
        isInteractive
        valueFormat=">-d"
        layers={["arcs", "arcLabels", "legends"]}
      />
    </div>
  );
}

export function ApplicationCalendar({
  data,
  from,
  to,
}: {
  data: { day: string; value: number }[];
  from: string;
  to: string;
}) {
  const { theme, dark } = useChartTheme();
  return (
    <div className="h-40 min-w-[760px]" role="img" aria-label="Applications per day over the last year">
      <ResponsiveTimeRange
        data={data}
        from={from}
        to={to}
        emptyColor={dark ? "#1e293b" : "#eef2f7"}
        colors={dark ? ["#312e81", "#4338ca", "#6366f1", "#a5b4fc"] : ["#c7d2fe", "#818cf8", "#6366f1", "#4338ca"]}
        margin={{ top: 24, right: 8, bottom: 0, left: 32 }}
        firstWeekday="monday"
        weekdayTicks={[0, 2, 4]}
        dayBorderWidth={2}
        dayBorderColor={dark ? "#020617" : "#ffffff"}
        dayRadius={2}
        theme={theme}
        tooltip={({ day, value }) => (
          <div className="rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow">
            {value} applied · {day}
          </div>
        )}
      />
    </div>
  );
}
