"use client";

import { CSSProperties, ReactNode, useState } from "react";

export function Card({
  children,
  style,
  accent,
  hover,
  glass,
}: {
  children: ReactNode;
  style?: CSSProperties;
  accent?: string;
  hover?: boolean;
  glass?: boolean;
}) {
  return (
    <div
      className={glass ? "glass" : ""}
      style={{
        background: glass ? undefined : "var(--surface)",
        border: glass ? undefined : `1px solid ${accent ?? "var(--border)"}`,
        borderRadius: "var(--radius-xl)",
        padding: 24,
        marginBottom: 16,
        position: "relative",
        overflow: "hidden",
        backdropFilter: glass ? undefined : "blur(20px)",
        transition: hover ? "transform 0.15s" : undefined,
        ...style,
      }}
      onMouseOver={
        hover
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform =
                "translateY(-2px)";
            }
          : undefined
      }
      onMouseOut={
        hover
          ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform =
                "translateY(0)";
            }
          : undefined
      }
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
            fontSize: 22,
            fontWeight: 800,
            color: "var(--text)",
            letterSpacing: "-0.3px",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 4,
              fontFamily: "var(--mono)",
            }}
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
        fontSize: 9,
        color: "var(--text-muted)",
        letterSpacing: "2px",
        textTransform: "uppercase",
        marginBottom: 12,
        fontFamily: "var(--mono)",
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
        borderRadius: "var(--radius-md)",
        padding: 16,
        position: "relative",
        overflow: "hidden",
        backdropFilter: "blur(20px)",
        boxShadow: "inset 0 1px 0 var(--glass-highlight)",
        transition: "transform 0.15s, border-color 0.15s",
      }}
      onMouseOver={(e) =>
        ((e.currentTarget as HTMLDivElement).style.transform =
          "translateY(-2px)")
      }
      onMouseOut={(e) =>
        ((e.currentTarget as HTMLDivElement).style.transform = "translateY(0)")
      }
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: color ?? "var(--accent)",
          borderRadius: "12px 12px 0 0",
        }}
      />
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 26,
          fontWeight: 700,
          color: color ?? "var(--text)",
          lineHeight: 1,
          marginTop: 4,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 9,
          color: "var(--text-muted)",
          letterSpacing: "1.5px",
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
          fontSize: 9,
          color: "var(--text-muted)",
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          marginBottom: 6,
          fontFamily: "var(--mono)",
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
        padding: "10px 14px",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        color: "var(--text)",
        outline: "none",
        fontFamily: "var(--mono)",
        fontSize: 13,
        transition: "border-color 0.15s, box-shadow 0.15s",
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
        padding: "10px 14px",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        color: "var(--text)",
        outline: "none",
        fontFamily: "var(--mono)",
        fontSize: 13,
        cursor: "pointer",
        transition: "border-color 0.15s",
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
    primary: {
      background: "var(--accent)",
      color: "var(--bg)",
      fontWeight: 700,
      boxShadow: "0 4px 20px var(--accent-glow), 0 0 40px var(--accent-dim)",
    },
    secondary: {
      background: "var(--surface2)",
      color: "var(--text-muted)",
      border: "1px solid var(--border)",
    },
    danger: {
      background: "var(--red-dim)",
      color: "var(--red)",
      border: "1px solid var(--red-dim)",
    },
  };
  return (
    <button
      {...props}
      disabled={disabled}
      style={{
        padding: "12px 24px",
        fontSize: 11,
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        border: "none",
        borderRadius: "var(--radius-sm)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "opacity 0.15s, transform 0.1s, box-shadow 0.15s",
        fontFamily: "var(--sans)",
        fontWeight: 600,
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
        padding: "6px 14px",
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        fontSize: 11,
        color: active ? "var(--accent)" : "var(--text-muted)",
        background: active ? "var(--accent-dim)" : "var(--surface2)",
        cursor: "pointer",
        letterSpacing: "0.5px",
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
  vhard: {
    border: "var(--red)",
    color: "var(--red)",
    bg: "var(--red-dim)",
  },
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
        padding: "9px 18px",
        border: `1px solid ${selected ? c.border : "var(--border)"}`,
        borderRadius: "var(--radius-sm)",
        fontSize: 11,
        fontFamily: "var(--mono)",
        color: selected ? c.color : "var(--text-muted)",
        background: selected ? c.bg : "var(--surface2)",
        cursor: "pointer",
        transition: "all 0.15s",
        letterSpacing: "0.5px",
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
  minVal,
}: {
  data: { label: string; value: number }[];
  color?: string;
  maxVal?: number;
  minVal?: number;
}) {
  const rawMax = maxVal ?? Math.max(...data.map((d) => d.value), 1);
  const rawMin = minVal ?? 0;
  const range  = Math.max(rawMax - rawMin, 1);
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
            backdropFilter: "blur(20px)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: "4px 12px",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--text)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
            animation: "fadeInFast 0.1s ease-out",
          }}
        >
          {tooltip.label}: <strong>{tooltip.value}</strong>
        </div>
      )}
      <div
        style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}
      >
        {data.map((d, i) => {
          // Only show a label every N bars so they never overlap
          const step = Math.ceil(data.length / 5);
          const showLabel = i % step === 0 || i === data.length - 1;
          return (
            <div
              key={i}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                height: "100%",
                minWidth: 0,
                overflow: "hidden",
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
                    height: `${Math.max(4, ((d.value - rawMin) / range) * 100)}%`,
                    background:
                      tooltip?.index === i ? "var(--glass-highlight)" : color,
                    borderRadius: "4px 4px 0 0",
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
                  color: showLabel ? "var(--text-dim)" : "transparent",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  maxWidth: "100%",
                  lineHeight: 1,
                }}
              >
                {d.label}
              </div>
            </div>
          );
        })}
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
        border: `2px solid var(--border)`,
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite",
        display: "inline-block",
      }}
    />
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-xl)",
        padding: 24,
        marginBottom: 16,
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: i === 0 ? 24 : 12,
            width: i === 0 ? "40%" : `${60 + Math.random() * 30}%`,
            marginBottom: i === rows - 1 ? 0 : 14,
          }}
        />
      ))}
    </div>
  );
}

export function SkeletonGrid({ cols = 4 }: { cols?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 12,
        marginBottom: 16,
      }}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div
          key={i}
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 16,
          }}
        >
          <div
            className="skeleton"
            style={{ height: 24, width: "60%", marginBottom: 8 }}
          />
          <div className="skeleton" style={{ height: 10, width: "80%" }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "48px 20px",
        textAlign: "center",
        color: "var(--text-dim)",
        fontSize: 13,
        border: "1px dashed var(--border2)",
        borderRadius: "var(--radius-md)",
        fontFamily: "var(--mono)",
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
        padding: "5px 12px",
        borderRadius: 99,
        border: `1px solid ${color}`,
        background: `var(--surface2)`,
        fontFamily: "var(--mono)",
        fontSize: 10,
        color,
        letterSpacing: "1px",
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

export function NudgeCard({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--accent-dim)",
        border: "1px solid var(--accent-glow)",
        borderRadius: "var(--radius-md)",
        padding: "16px 18px",
        backdropFilter: "blur(20px)",
        boxShadow: "inset 0 1px 0 var(--accent-dim)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            background: "var(--accent-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </div>
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "2px",
            textTransform: "uppercase",
            fontFamily: "var(--mono)",
          }}
        >
          Coach Insight
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--soft)",
          fontSize: 13,
          color: "var(--text-secondary)",
          lineHeight: 1.7,
          fontWeight: 300,
        }}
      >
        {children}
      </div>
    </div>
  );
}
