import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAdminTheme } from "../../theme/adminTheme";
import mm from "./MemberHub.module.css";
import { formatMoney } from "./hubData";

const palette = ["#2563eb", "#059669", "#d97706", "#e11d48", "#0284c7", "#7c3aed"];

const moneyTick = (value, currency = "USD") => {
  const amount = Number(value) || 0;
  const symbol = currency === "EUR" ? "€" : "$";
  if (Math.abs(amount) >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}k`;
  return `${symbol}${amount.toFixed(0)}`;
};

const HubChart = ({
  type = "area",
  data = [],
  emptyLabel = "Not enough historical data",
  currency = "USD",
}) => {
  const theme = useAdminTheme();
  const dark = theme?.resolvedTheme === "dark";
  const axis = dark ? "#8b93a1" : "#6b7280";
  const grid = dark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)";
  const tipBg = dark ? "#1a1f28" : "#ffffff";
  const tipFg = dark ? "#f3f5f7" : "#111827";

  if (!data.length) {
    return <div className={mm.empty}>{emptyLabel}</div>;
  }

  const tooltip = {
    contentStyle: {
      background: tipBg,
      border: `1px solid ${grid}`,
      borderRadius: 10,
      color: tipFg,
    },
  };

  if (type === "pie") {
    return (
      <div className={mm.chart}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
              {data.map((entry, index) => (
                <Cell key={entry.name || index} fill={palette[index % palette.length]} />
              ))}
            </Pie>
            <Tooltip {...tooltip} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === "bar") {
    return (
      <div className={mm.chart}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} />
            <YAxis tick={{ fill: axis, fontSize: 11 }} />
            <Tooltip {...tooltip} />
            <Bar dataKey="deposits" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="withdrawals" fill="#e11d48" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const isValue = type === "value" || data.some((point) => point.value != null && point.net == null);
  const first = Number(data[0]?.value);
  const last = Number(data[data.length - 1]?.value);
  const up = Number.isFinite(first) && Number.isFinite(last) ? last >= first : true;
  const stroke = isValue ? (up ? "#059669" : "#e11d48") : "#2563eb";
  const fill = isValue
    ? up
      ? "rgba(5,150,105,0.16)"
      : "rgba(225,29,72,0.14)"
    : "rgba(37,99,235,0.18)";

  return (
    <div className={mm.chart}>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} />
          <YAxis
            tick={{ fill: axis, fontSize: 11 }}
            tickFormatter={isValue ? (value) => moneyTick(value, currency) : undefined}
          />
          <Tooltip
            {...tooltip}
            formatter={
              isValue
                ? (value) => [formatMoney(value, currency), "Marked value"]
                : undefined
            }
          />
          <Area
            type="monotone"
            dataKey={isValue ? "value" : "net"}
            stroke={stroke}
            fill={fill}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HubChart;
