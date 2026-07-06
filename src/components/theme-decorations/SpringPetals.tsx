// src/components/theme-decorations/SpringPetals.tsx
// Fixed, low-opacity sakura petals drifting down and swaying for the
// Spring theme. Pointer-events disabled and sits at z-index 0 so it
// never interferes with layout, scrolling, or clicks.
function petal(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}C${cx + r * 0.6} ${cy - r} ${cx + r * 0.6} ${cy + r} ${cx} ${cy + r}C${cx - r * 0.6} ${cy + r} ${cx - r * 0.6} ${cy - r} ${cx} ${cy - r}Z`;
}

const PETALS = [
  { x: 30, y: 20, r: 7, duration: "9s", delay: "0s" },
  { x: 150, y: 10, r: 5, duration: "11s", delay: "1.5s" },
  { x: 90, y: 0, r: 6, duration: "8s", delay: "3s" },
  { x: 220, y: 30, r: 5, duration: "10s", delay: "2.2s" },
  { x: 260, y: 5, r: 6, duration: "12s", delay: "4.5s" },
  { x: 190, y: 15, r: 4.5, duration: "9.5s", delay: "0.8s" },
];

export default function SpringPetals() {
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
      {PETALS.map((p, i) => (
        <path
          key={i}
          className="petal-fall"
          d={petal(p.x, p.y, p.r)}
          fill="#E58AA0"
          style={{
            animationDuration: p.duration,
            animationDelay: p.delay,
            transformOrigin: `${p.x}px ${p.y}px`,
          }}
        />
      ))}
    </svg>
  );
}
