// src/components/theme-decorations/WinterSnow.tsx
// Fixed, low-opacity snowflakes drifting gently down for the Winter
// theme. Pointer-events disabled and sits at z-index 0 so it never
// interferes with layout, scrolling, or clicks.
function snowflake(cx: number, cy: number, r: number): string {
  const a = r * 0.87;
  const b = r * 0.5;
  return `M${cx} ${cy - r}L${cx} ${cy + r}M${cx - a} ${cy - b}L${cx + a} ${cy + b}M${cx + a} ${cy - b}L${cx - a} ${cy + b}`;
}

const FLAKES = [
  { x: 30, y: 10, r: 5, duration: "13s", delay: "0s" },
  { x: 150, y: 0, r: 3.5, duration: "16s", delay: "2.4s" },
  { x: 95, y: 20, r: 4, duration: "12s", delay: "5s" },
  { x: 225, y: 5, r: 4.5, duration: "15s", delay: "3.2s" },
  { x: 260, y: 15, r: 3, duration: "14s", delay: "1.1s" },
  { x: 190, y: 8, r: 4, duration: "13.5s", delay: "6.2s" },
];

export default function WinterSnow() {
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
      {FLAKES.map((f, i) => (
        <path
          key={i}
          className="snow-fall"
          d={snowflake(f.x, f.y, f.r)}
          stroke="#7EC8E3"
          strokeWidth={1.2}
          strokeLinecap="round"
          style={{
            animationDuration: f.duration,
            animationDelay: f.delay,
            transformOrigin: `${f.x}px ${f.y}px`,
          }}
        />
      ))}
    </svg>
  );
}
