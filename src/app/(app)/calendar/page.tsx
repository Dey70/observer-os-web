"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, rpeToLabel, calcReadiness } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import type { Session, DailyLog } from "@/types";
import {
  ChevronLeft,
  ChevronRight,
  Activity,
  Dumbbell,
  BookOpen,
  Moon,
} from "lucide-react";

export const dynamic = "force-dynamic";

const DAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const TYPE_COLOR: Record<string, string> = {
  run: "#00E676",
  lift: "#A78BFA",
  study: "#FFB800",
};
const TYPE_ICON: Record<string, React.ElementType> = {
  run: Activity,
  lift: Dumbbell,
  study: BookOpen,
};

type DayData = { sessions: Session[]; log: DailyLog | null };

export default function CalendarPage() {
  const sb = createClient();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;

    const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0);
    const lastStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

    const [{ data: sessions }, { data: logs }] = await Promise.all([
      sb
        .from("sessions")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", firstDay)
        .lte("date", lastStr),
      sb
        .from("daily_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", firstDay)
        .lte("date", lastStr),
    ]);

    const map: Record<string, DayData> = {};
    (sessions ?? []).forEach((s: Session) => {
      if (!map[s.date]) map[s.date] = { sessions: [], log: null };
      map[s.date].sessions.push(s);
    });
    (logs ?? []).forEach((l: DailyLog) => {
      if (!map[l.date]) map[l.date] = { sessions: [], log: null };
      map[l.date].log = l;
    });

    setDayMap(map);
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
    setSelectedDate(null);
  }

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const selectedData = selectedDate ? dayMap[selectedDate] : null;

  return (
    <div>
      <PageHeader title="CALENDAR" subtitle="Sessions and check-ins by day" />

      {/* Month nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: "10px 14px",
        }}
      >
        <button onClick={prevMonth} style={navBtnStyle}>
          <ChevronLeft size={16} color="rgba(255,255,255,0.6)" />
        </button>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}
        >
          {MONTHS[month]} {year}
        </div>
        <button onClick={nextMonth} style={navBtnStyle}>
          <ChevronRight size={16} color="rgba(255,255,255,0.6)" />
        </button>
      </div>

      {/* Day headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 3,
          marginBottom: 3,
        }}
      >
        {DAYS_SHORT.map((d, i) => (
          <div
            key={i}
            style={{
              textAlign: "center",
              fontSize: 9,
              fontFamily: "var(--mono)",
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "0.1em",
              padding: "3px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid — compact, fits screen */}
      {loading ? (
        <div
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--mono)",
            fontSize: 13,
            padding: 24,
            textAlign: "center",
          }}
        >
          Loading...
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 3,
          }}
        >
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ aspectRatio: "1" }} />;
            const ds = dateStr(day);
            const data = dayMap[ds];
            const isToday = ds === todayStr;
            const isSelected = ds === selectedDate;
            const hasCheckin = !!data?.log;
            const sessionTypes = [
              ...new Set(data?.sessions.map((s) => s.type) ?? []),
            ];

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(isSelected ? null : ds)}
                style={{
                  aspectRatio: "1",
                  borderRadius: 8,
                  border: isSelected
                    ? "1.5px solid #E8FF47"
                    : isToday
                      ? "1.5px solid rgba(232,255,71,0.4)"
                      : "1px solid rgba(255,255,255,0.06)",
                  background: isSelected
                    ? "rgba(232,255,71,0.08)"
                    : isToday
                      ? "rgba(232,255,71,0.04)"
                      : "rgba(255,255,255,0.03)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "4px 2px",
                  gap: 2,
                  transition: "all 0.12s",
                  minHeight: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    fontWeight: isToday ? 700 : 400,
                    color: isToday
                      ? "#E8FF47"
                      : isSelected
                        ? "#E8FF47"
                        : "rgba(255,255,255,0.6)",
                    lineHeight: 1,
                  }}
                >
                  {day}
                </span>

                {/* Dots row */}
                {(hasCheckin || sessionTypes.length > 0) && (
                  <div
                    style={{
                      display: "flex",
                      gap: 2,
                      alignItems: "center",
                      flexWrap: "wrap",
                      justifyContent: "center",
                    }}
                  >
                    {hasCheckin && (
                      <div
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "#E8FF47",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {sessionTypes.map((t) => (
                      <div
                        key={t}
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: TYPE_COLOR[t],
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 14,
          flexWrap: "wrap",
          padding: "10px 14px",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 10,
        }}
      >
        {[
          { color: "#E8FF47", label: "Check-in" },
          { color: "#00E676", label: "Run" },
          { color: "#A78BFA", label: "Lift" },
          { color: "#FFB800", label: "Study" },
        ].map(({ color, label }) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 5 }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: color,
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.4)",
                fontFamily: "var(--mono)",
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Day detail panel — always below grid on all screen sizes */}
      {selectedDate && (
        <div style={{ marginTop: 16 }}>
          {selectedData ? (
            <DayPanel date={selectedDate} data={selectedData} />
          ) : (
            <EmptyDayPanel date={selectedDate} />
          )}
        </div>
      )}

      {!selectedDate && (
        <div
          style={{
            marginTop: 16,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14,
            padding: 20,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.25)",
              fontFamily: "var(--mono)",
            }}
          >
            Tap any day to see details
          </div>
        </div>
      )}
    </div>
  );
}

function DayPanel({ date, data }: { date: string; data: DayData }) {
  const { sessions, log } = data;
  const readiness = log
    ? calcReadiness(
        log.sleep_quality,
        log.soreness,
        log.fatigue,
        log.mood,
        log.energy,
      )
    : null;
  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 14,
        overflow: "hidden",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontFamily: "var(--mono)",
            fontWeight: 700,
            color: "#E8FF47",
          }}
        >
          {displayDate}
        </div>
      </div>

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* Check-in */}
        {log && readiness ? (
          <div>
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.3)",
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontFamily: "var(--mono)",
                marginBottom: 8,
              }}
            >
              Daily Check-in
            </div>
            <div
              style={{
                background: `${readiness.color}10`,
                border: `1px solid ${readiness.color}30`,
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 22,
                    fontWeight: 700,
                    color: readiness.color,
                  }}
                >
                  {readiness.score.toFixed(1)}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    fontFamily: "var(--mono)",
                    color: readiness.color,
                    letterSpacing: "1px",
                    textTransform: "uppercase",
                  }}
                >
                  {readiness.label}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 8,
                }}
              >
                {[
                  {
                    label: "Sleep",
                    value: `${log.sleep_hours}h Q${log.sleep_quality}`,
                  },
                  { label: "Mood", value: `${log.mood}/10` },
                  { label: "Energy", value: `${log.energy}/10` },
                  { label: "Soreness", value: `${log.soreness}/10` },
                  { label: "Fatigue", value: `${log.fatigue}/10` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div
                      style={{
                        fontSize: 8,
                        color: "rgba(255,255,255,0.3)",
                        fontFamily: "var(--mono)",
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--mono)",
                        color: "rgba(255,255,255,0.7)",
                        marginTop: 1,
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              {log.notes && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    color: "rgba(255,255,255,0.4)",
                    fontStyle: "italic",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    paddingTop: 8,
                  }}
                >
                  "{log.notes}"
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              background: "rgba(255,255,255,0.02)",
              border: "1px dashed rgba(255,255,255,0.07)",
              borderRadius: 8,
            }}
          >
            <Moon size={13} color="rgba(255,255,255,0.2)" />
            <span
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.25)",
                fontFamily: "var(--mono)",
              }}
            >
              No check-in logged
            </span>
          </div>
        )}

        {/* Sessions */}
        <div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "2px",
              textTransform: "uppercase",
              fontFamily: "var(--mono)",
              marginBottom: 8,
            }}
          >
            Sessions ({sessions.length})
          </div>
          {sessions.length === 0 ? (
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.25)",
                fontFamily: "var(--mono)",
              }}
            >
              Rest day
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sessions.map((s) => {
                const Icon = TYPE_ICON[s.type];
                const color = TYPE_COLOR[s.type];
                return (
                  <div
                    key={s.id}
                    style={{
                      padding: "10px 12px",
                      background: `${color}08`,
                      border: `1px solid ${color}25`,
                      borderRadius: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Icon size={12} color={color} strokeWidth={2} />
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 10,
                            color,
                            textTransform: "uppercase",
                            fontWeight: 700,
                          }}
                        >
                          {s.type}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "rgba(255,255,255,0.8)",
                        }}
                      >
                        {formatDuration(s.duration)}
                      </span>
                    </div>
                    {s.notes && (
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(255,255,255,0.55)",
                          marginBottom: 3,
                        }}
                      >
                        {s.notes}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--mono)",
                        color: "rgba(255,255,255,0.3)",
                      }}
                    >
                      RPE {s.rpe}/10 · {rpeToLabel(s.rpe)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyDayPanel({ date }: { date: string }) {
  const displayDate = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        padding: 20,
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontFamily: "var(--mono)",
          fontWeight: 700,
          color: "#E8FF47",
          marginBottom: 10,
        }}
      >
        {displayDate}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.25)",
          fontFamily: "var(--mono)",
        }}
      >
        No activity on this day
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  cursor: "pointer",
};
