// src/components/theme-decorations/AutumnLeaves.tsx
// Fixed, low-opacity maple leaves tumbling down for the Autumn theme.
// Pointer-events disabled and sits at z-index 0 so it never interferes
// with layout, scrolling, or clicks.
function leaf(cx: number, cy: number, r: number): string {
  const body = `M${cx} ${cy - r}C${cx + r * 0.6} ${cy - r} ${cx + r * 0.6} ${cy + r} ${cx} ${cy + r}C${cx - r * 0.6} ${cy + r} ${cx - r * 0.6} ${cy - r} ${cx} ${cy - r}Z`;
  const stem = `M${cx} ${cy - r}L${cx} ${cy - r * 1.3}`;
  return `${body} ${stem}`;
}

const LEAVES = [
  { x: 25, y: 15, r: 8, duration: "10s", delay: "0s" },
  { x: 140, y: 5, r: 6, duration: "12s", delay: "2.2s" },
  { x: 85, y: 25, r: 7, duration: "9s", delay: "4s" },
  { x: 210, y: 10, r: 6.5, duration: "11s", delay: "1.3s" },
  { x: 250, y: 20, r: 7.5, duration: "13s", delay: "3.6s" },
];

export default function AutumnLeaves() {
  return (
    <svg
      width="300"
      height="700"
      viewBox="0 0 300 700"
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {LEAVES.map((l, i) => (
        <path
          key={i}
          className="leaf-fall"
          d={leaf(l.x, l.y, l.r)}
          fill="#D97B29"
          stroke="#D97B29"
          strokeWidth={0.6}
          style={{
            animationDuration: l.duration,
            animationDelay: l.delay,
            transformOrigin: `${l.x}px ${l.y}px`,
          }}
        />
      ))}
    </svg>
  );
}
