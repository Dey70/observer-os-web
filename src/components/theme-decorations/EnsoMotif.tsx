// src/components/theme-decorations/EnsoMotif.tsx
// Fixed, low-opacity ensō (hand-drawn Zen circle) motif for the Japanese
// theme — an incomplete brush-stroke ring rather than a closed circle.
// Pointer-events disabled and sits at z-index 0 so it never interferes
// with layout, scrolling, or clicks.
export default function EnsoMotif() {
  return (
    <svg
      className="enso-motif"
      width="260"
      height="260"
      viewBox="0 0 260 260"
      aria-hidden="true"
      style={{
        position: "fixed",
        top: -50,
        right: -50,
        opacity: 0.12,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      <path
        d="M130 20
           A110 110 0 1 1 42 200"
        fill="none"
        stroke="#4A6FA5"
        strokeWidth={7}
        strokeLinecap="round"
      />
    </svg>
  );
}
