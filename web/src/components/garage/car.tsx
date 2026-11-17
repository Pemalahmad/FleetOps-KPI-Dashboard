/** Compact top-down car artwork for garage status bays. Color describes queue state, not paint. */
export function GarageCar({ color = "var(--accent)", small = false }: { color?: string; small?: boolean }) {
  return <svg viewBox="0 0 70 112" className={small ? "garage-car garage-car-small" : "garage-car"} aria-hidden="true">
    <ellipse cx="35" cy="59" rx="25" ry="45" fill="currentColor" opacity=".07" />
    <rect x="9" y="25" width="8" height="20" rx="3" fill="var(--text)" opacity=".65" />
    <rect x="53" y="25" width="8" height="20" rx="3" fill="var(--text)" opacity=".65" />
    <rect x="9" y="72" width="8" height="20" rx="3" fill="var(--text)" opacity=".65" />
    <rect x="53" y="72" width="8" height="20" rx="3" fill="var(--text)" opacity=".65" />
    <path d="M21 8Q35 3 49 8L55 24L56 89Q56 101 47 104H23Q14 101 14 89L15 24Z" fill={color} />
    <path d="M23 13Q35 10 47 13L49 28H21Z" fill="white" opacity=".12" />
    <path d="M21 32L49 32L46 46H24Z" fill="var(--bg)" opacity=".85" />
    <path d="M24 49H46V72H24Z" fill="white" opacity=".16" />
    <path d="M24 76H46L49 88H21Z" fill="var(--bg)" opacity=".8" />
    <path d="M18 32L21 47V72L18 81ZM52 32L49 47V72L52 81Z" fill="var(--bg)" opacity=".55" />
    <rect x="17" y="16" width="9" height="4" rx="2" fill="#fff" opacity=".9" />
    <rect x="44" y="16" width="9" height="4" rx="2" fill="#fff" opacity=".9" />
    <rect x="18" y="96" width="8" height="3" rx="1" fill="var(--bad)" />
    <rect x="44" y="96" width="8" height="3" rx="1" fill="var(--bad)" />
    <path d="M21 93H49" stroke="var(--bg)" strokeWidth="1" opacity=".3" />
  </svg>;
}
