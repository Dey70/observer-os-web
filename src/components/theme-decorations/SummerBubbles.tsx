// src/components/theme-decorations/SummerBubbles.tsx
// Fixed, low-opacity bubbles rising and swaying for the Summer theme.
// Pointer-events disabled and sits at z-index 0 so it never interferes
// with layout, scrolling, or clicks.
const BUBBLES = [
  { x: 40, y: 660, r: 6, duration: "8s", delay: "0s" },
  { x: 160, y: 690, r: 4, duration: "10s", delay: "1.8s" },
  { x: 90, y: 700, r: 5, duration: "9s", delay: "3.4s" },
  { x: 220, y: 670, r: 3.5, duration: "11s", delay: "2.6s" },
  { x: 260, y: 695, r: 5.5, duration: "7.5s", delay: "0.9s" },
  { x: 190, y: 680, r: 4, duration: "9.5s", delay: "4.2s" },
];

export default function SummerBubbles() {
  return (
    <svg
      width="300"
      height="700"
      viewBox="0 0 300 700"
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {BUBBLES.map((b, i) => (
        <circle
          key={i}
          className="bubble-rise"
          cx={b.x}
          cy={b.y}
          r={b.r}
          fill="none"
          stroke="#1B9C85"
          strokeWidth={1.2}
          style={{
            animationDuration: b.duration,
            animationDelay: b.delay,
            transformOrigin: `${b.x}px ${b.y}px`,
          }}
        />
      ))}
    </svg>
  );
}
