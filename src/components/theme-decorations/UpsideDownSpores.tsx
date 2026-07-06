// src/components/theme-decorations/UpsideDownSpores.tsx
// Fixed, low-opacity drifting spore particles for the Stranger Things
// theme, evoking the ash/spores of the Upside Down. Pointer-events
// disabled and sits at z-index 0 so it never interferes with layout,
// scrolling, or clicks.
const SPORES = [
  { x: 40, y: 560, r: 3, delay: "0s" },
  { x: 160, y: 680, r: 2, delay: "1.2s" },
  { x: 90, y: 740, r: 2.5, delay: "2.4s" },
  { x: 220, y: 610, r: 1.8, delay: "0.8s" },
  { x: 260, y: 720, r: 2.2, delay: "1.8s" },
];

export default function UpsideDownSpores() {
  return (
    <svg
      width="300"
      height="800"
      viewBox="0 0 300 800"
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        opacity: 0.5,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {SPORES.map((s, i) => (
        <circle
          key={i}
          className="spore"
          cx={s.x}
          cy={s.y}
          r={s.r}
          fill="#E8000D"
          style={{ animationDelay: s.delay }}
        />
      ))}
    </svg>
  );
}
