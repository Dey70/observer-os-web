// src/components/theme-decorations/IndianMotif.tsx
// Fixed, low-opacity 12-petal lotus/mandala corner motif for the Indian
// theme. Pointer-events disabled and sits at z-index 0 so it never
// interferes with layout, scrolling, or clicks.
const PETAL_COUNT = 12;

export default function IndianMotif() {
  return (
    <svg
      className="indian-motif"
      width="280"
      height="280"
      viewBox="0 0 280 280"
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: -60,
        left: -60,
        opacity: 0.14,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <g transform="translate(140,140)">
        {Array.from({ length: PETAL_COUNT }).map((_, i) => (
          <path
            key={i}
            d="M0 -20 C10 -60 10 -100 0 -130 C-10 -100 -10 -60 0 -20 Z"
            fill="none"
            stroke="#FFC166"
            strokeWidth={1.2}
            transform={`rotate(${(360 / PETAL_COUNT) * i})`}
          />
        ))}
        <circle r={18} fill="none" stroke="#FFC166" strokeWidth={1.2} />
        <circle r={7} fill="#FFC166" fillOpacity={0.5} />
      </g>
    </svg>
  );
}
