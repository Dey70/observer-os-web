"use client";

import { CSSProperties, ReactNode, useState } from "react";

export function Card({
  children,
  style,
  accent,
}: {
  children: ReactNode;
  style?: CSSProperties;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${accent ?? "var(--border)"}`,
        padding: 20,
        marginBottom: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 28,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}
          >
            {subtitle}
          </div>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        color: "var(--text-muted)",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

export function StatCard({
  value,
  label,
  color,
}: {
  value: string | number;
  label: string;
  color?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        padding: 16,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 26,
          fontWeight: 700,
          color: color ?? "var(--text)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontSize: 10,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export function Input({
  style,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: "9px 12px",
        background: "var(--bg)",
        border: "1px solid var(--border2)",
        color: "var(--text)",
        outline: "none",
        fontFamily: "var(--mono)",
        fontSize: 13,
        ...style,
      }}
    />
  );
}

export function Select({
  style,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        padding: "9px 12px",
        background: "var(--bg)",
        border: "1px solid var(--border2)",
        color: "var(--text)",
        outline: "none",
        fontFamily: "var(--mono)",
        fontSize: 13,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </select>
  );
}

export function Button({
  variant = "primary",
  children,
  style,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: "var(--accent)", color: "#000", fontWeight: 600 },
    secondary: {
      background: "none",
      color: "var(--text-muted)",
      border: "1px solid var(--border2)",
    },
    danger: {
      background: "none",
      color: "var(--red)",
      border: "1px solid var(--red)",
    },
  };
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        padding: "10px 20px",
        fontSize: 12,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "opacity 0.15s",
        fontFamily: "var(--sans)",
        ...styles[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        border: `1px solid ${active ? "var(--accent)" : "var(--border2)"}`,
        fontSize: 11,
        color: active ? "var(--accent)" : "var(--text-muted)",
        background: active ? "var(--accent-dim)" : "none",
        cursor: "pointer",
        letterSpacing: "0.04em",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

const effortColors = {
  easy: {
    border: "var(--green)",
    color: "var(--green)",
    bg: "var(--green-dim)",
  },
  medium: {
    border: "var(--yellow)",
    color: "var(--yellow)",
    bg: "var(--yellow-dim)",
  },
  hard: {
    border: "var(--accent)",
    color: "var(--accent)",
    bg: "var(--accent-dim)",
  },
  vhard: { border: "var(--red)", color: "var(--red)", bg: "var(--red-dim)" },
};

export function EffortButton({
  value,
  label,
  selected,
  onClick,
}: {
  value: keyof typeof effortColors;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const c = effortColors[value];
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        border: `1px solid ${selected ? c.border : "var(--border2)"}`,
        fontSize: 12,
        fontFamily: "var(--mono)",
        color: selected ? c.color : "var(--text-muted)",
        background: selected ? c.bg : "none",
        cursor: "pointer",
        transition: "all 0.15s",
        letterSpacing: "0.05em",
      }}
    >
      {label}
    </button>
  );
}

export function BarChart({
  data,
  color = "var(--accent)",
  maxVal,
}: {
  data: { label: string; value: number }[];
  color?: string;
  maxVal?: number;
}) {
  const max = maxVal ?? Math.max(...data.map((d) => d.value), 1);
  const [tooltip, setTooltip] = useState<{
    label: string;
    value: number;
    index: number;
  } | null>(null);

  return (
    <div style={{ position: "relative", paddingTop: 36 }}>
      {tooltip && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            padding: "4px 10px",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--text)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {tooltip.label}: <strong>{tooltip.value}</strong>
        </div>
      )}
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}
      >
        {data.map((d, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              height: "100%",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "flex-end",
                width: "100%",
              }}
            >
              <div
                onMouseEnter={() =>
                  setTooltip({ label: d.label, value: d.value, index: i })
                }
                onMouseLeave={() => setTooltip(null)}
                style={{
                  width: "100%",
                  height: `${Math.max(2, (d.value / max) * 100)}%`,
                  background: tooltip?.index === i ? "var(--text)" : color,
                  opacity: tooltip?.index === i ? 1 : 0.75,
                  transition: "all 0.15s",
                  cursor: "pointer",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 8,
                color: "var(--text-dim)",
                whiteSpace: "nowrap",
              }}
            >
              {d.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `2px solid var(--border2)`,
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite",
        display: "inline-block",
      }}
    />
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
        color: "var(--text-dim)",
        fontSize: 13,
        border: "1px dashed var(--border)",
      }}
    >
      {message}
    </div>
  );
}

export function Badge({
  children,
  color = "var(--accent)",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        border: `1px solid ${color}`,
        fontFamily: "var(--mono)",
        fontSize: 10,
        color,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

export function TypingDots() {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        alignItems: "center",
        padding: "12px 16px",
      }}
    >
      {[0, 150, 300].map((delay) => (
        <div
          key={delay}
          style={{
            width: 5,
            height: 5,
            background: "var(--text-muted)",
            borderRadius: "50%",
            animation: `bounce 1s ${delay}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}
