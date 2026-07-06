// src/components/theme-decorations/ComicBurst.tsx
// Fixed, low-opacity comic-book "impact burst" star outline plus a field
// of floating 4-point comic sparks for the Marvel theme. Pointer-events
// disabled and sits at z-index 0 so it never interferes with layout,
// scrolling, or clicks.
const POINTS = 10;
const OUTER_R = 90;
const INNER_R = 42;
const CENTER = 100;

function burstPath(): string {
  const pts: string[] = [];
  for (let i = 0; i < POINTS * 2; i++) {
    const r = i % 2 === 0 ? OUTER_R : INNER_R;
    const angle = (Math.PI / POINTS) * i - Math.PI / 2;
    const x = CENTER + r * Math.cos(angle);
    const y = CENTER + r * Math.sin(angle);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

function sparkPath(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

const SPARKS = [
  { x: 30, y: 540, r: 9, delay: "0s" },
  { x: 150, y: 660, r: 6, delay: "1.4s" },
  { x: 80, y: 720, r: 7, delay: "2.6s" },
  { x: 210, y: 590, r: 5, delay: "0.7s" },
  { x: 250, y: 700, r: 8, delay: "1.9s" },
  { x: 120, y: 780, r: 6, delay: "3.2s" },
];

export default function ComicBurst() {
  return (
    <>
      <svg
        className="comic-burst"
        width="200"
        height="200"
        viewBox="0 0 200 200"
        aria-hidden="true"
        style={{
          position: "fixed",
          top: -40,
          right: -40,
          opacity: 0.1,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <path d={burstPath()} fill="none" stroke="#ED1D24" strokeWidth={3} strokeLinejoin="round" />
      </svg>
      <svg
        width="300"
        height="800"
        viewBox="0 0 300 800"
        aria-hidden="true"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        {SPARKS.map((s, i) => (
          <path
            key={i}
            className="comic-spark"
            d={sparkPath(s.x, s.y, s.r, s.r * 0.4)}
            fill="#FFC72C"
            style={{ animationDelay: s.delay, transformOrigin: `${s.x}px ${s.y}px` }}
          />
        ))}
      </svg>
    </>
  );
}
