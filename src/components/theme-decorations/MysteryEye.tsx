// src/components/theme-decorations/MysteryEye.tsx
// Fixed, low-opacity eye-within-a-compass sigil plus a field of floating
// candlelit sigils (crescent moons and stars) for the Lord of the
// Mysteries theme, evoking the secret-society/tarot occult motifs central
// to the novel. Pointer-events disabled and sits at z-index 0 so it never
// interferes with layout, scrolling, or clicks.

function crescent(cx: number, cy: number, r: number): string {
  const r2 = r * 1.6;
  return `M${cx} ${cy - r}A${r} ${r} 0 1 0 ${cx} ${cy + r}A${r2} ${r2} 0 1 1 ${cx} ${cy - r}Z`;
}

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.42;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`);
  }
  return `M${pts.join("L")}Z`;
}

const SIGILS = [
  { shape: "crescent" as const, x: 40, y: 560, r: 8, delay: "0s" },
  { shape: "star" as const, x: 170, y: 660, r: 6, delay: "1.6s" },
  { shape: "crescent" as const, x: 90, y: 730, r: 6, delay: "3.1s" },
  { shape: "star" as const, x: 230, y: 600, r: 5, delay: "0.9s" },
  { shape: "crescent" as const, x: 260, y: 710, r: 7, delay: "2.3s" },
];

export default function MysteryEye() {
  return (
    <>
      <svg
        className="mystery-eye"
        width="240"
        height="240"
        viewBox="0 0 240 240"
        aria-hidden="true"
        style={{
          position: "fixed",
          bottom: -40,
          right: -40,
          opacity: 0.14,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        <circle cx="120" cy="120" r="100" fill="none" stroke="#C08A3E" strokeWidth={1.2} />
        <path
          d="M40 120C65 85 95 68 120 68C145 68 175 85 200 120C175 155 145 172 120 172C95 172 65 155 40 120Z"
          fill="none"
          stroke="#C08A3E"
          strokeWidth={1.4}
        />
        <circle cx="120" cy="120" r="22" fill="none" stroke="#C08A3E" strokeWidth={1.4} />
        <circle cx="120" cy="120" r="8" fill="#C08A3E" fillOpacity={0.6} />
      </svg>
      <svg
        width="300"
        height="800"
        viewBox="0 0 300 800"
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          pointerEvents: "none",
          zIndex: 0,
        }}
      >
        {SIGILS.map((s, i) => (
          <path
            key={i}
            className="sigil-float"
            d={s.shape === "crescent" ? crescent(s.x, s.y, s.r) : star(s.x, s.y, s.r)}
            fill="#D4AF37"
            style={{ animationDelay: s.delay, transformOrigin: `${s.x}px ${s.y}px` }}
          />
        ))}
      </svg>
    </>
  );
}
