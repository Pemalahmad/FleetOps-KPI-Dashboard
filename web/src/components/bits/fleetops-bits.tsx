"use client";
/**
 * FleetOps wrappers around the React Bits components in this folder (the wrappers are FleetOps code; the components keep
 * their own licence, see LICENSE.md). They map the components to FleetOps' tokens and switch heavy effects off on
 * software rendering.
 */
import type { CSSProperties, ReactNode } from "react";
import DotGrid from "./DotGrid";
import SpotlightCard from "./SpotlightCard";
import ClickSpark from "./ClickSpark";
import ShinyText from "./ShinyText";
import GlareHover from "./GlareHover";
import LogoLoop from "./LogoLoop";
import Magnet from "./Magnet";
import { useSyncExternalStore } from "react";
import { useSoftwareGL, useTheme } from "../use-theme";

/** Interactive dot field behind a page header; fades out towards the text. */
export function HeaderDots() {
  const dark = useTheme(), software = useSoftwareGL();
  if (software) return null;
  return (
    <div className="page-dots" aria-hidden="true">
      <DotGrid key={dark ? "d" : "l"} dotSize={3} gap={20} baseColor={dark ? "#262b40" : "#d9dcea"} activeColor={dark ? "#818cf8" : "#6366f1"}
        proximity={130} strength={0.9} glow={0.35} clickShock={false} intro />
    </div>
  );
}

/** A card whose border and surface catch a soft light that follows the pointer. */
export function SpotCard({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const dark = useTheme();
  const pad = /(^|\s)!?p-/.test(className) ? "" : "!p-5";
  return (
    <SpotlightCard theme={dark ? "dark" : "light"} spotlightColor={dark ? "#818cf8" : "#6366f1"} intensity={dark ? 0.14 : 0.09}
      spotlightSize={300} borderGlow={0.55} flare={false}
      className={`card spot !rounded-[8px] ${pad} ${className}`}
      style={{ ["--spotlight-card-surface" as string]: "var(--panel)", ["--spotlight-card-border" as string]: "var(--border)", ["--spotlight-card-shadow" as string]: "none", ...style }}>
      {children}
    </SpotlightCard>
  );
}

/** Small accent sparks where the user clicks (the garage's game feel). */
export function Sparks({ children }: { children: ReactNode }) {
  return <ClickSpark sparkColor={["#6366f1", "#a5b4fc", "#34d399"]} sparkCount={9} sparkRadius={20} sparkSize={9} duration={420}>{children}</ClickSpark>;
}

const reducedQuery = "(prefers-reduced-motion: reduce)";
const subReduced = (cb: () => void) => { const q = matchMedia(reducedQuery); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };
/** The reader's reduced-motion preference, hydration-safe. */
export function useReducedMotion() {
  return useSyncExternalStore(subReduced, () => matchMedia(reducedQuery).matches, () => true);
}

/** A slow light sweep across quiet text (the grey half of a headline). */
export function Shine({ children }: { children: string }) {
  const dark = useTheme();
  return <ShinyText text={children} color={dark ? "#5d6480" : "#9aa0b4"} shineColor={dark ? "#c7d2fe" : "#6366f1"} speed={2.6} delay={3.5} shineWidth={22} trigger="loop" />;
}

/** A glare that crosses a card when the pointer enters it. */
export function Glare({ children }: { children: ReactNode }) {
  return (
    <GlareHover width="100%" height="100%" background="transparent" borderRadius="inherit" borderColor="transparent"
      glareColor="#a5b4fc" glareOpacity={0.22} glareSize={260} variant="sheen" mode="hover" className="glare-fill">
      {children}
    </GlareHover>
  );
}

/** A slow marquee of names (systems whose exports FleetOps reads). */
export function NameLoop({ names, label }: { names: string[]; label: string }) {
  const dark = useTheme();
  return (
    <LogoLoop ariaLabel={label} speed={36} gap={44} logoHeight={20} pauseOnHover fadeOut fadeOutColor={dark ? "#11141f" : "#ffffff"}
      logos={names.map((n) => ({ node: <span className="whitespace-nowrap text-[14px] font-semibold tracking-[-0.01em] text-muted">{n}</span>, title: n }))} />
  );
}

/** A button wrapper that leans gently towards the pointer. */
export function Pull({ children, block = false }: { children: ReactNode; block?: boolean }) {
  const reduced = useReducedMotion();
  return <Magnet padding={36} magnetStrength={4} maxOffset={6} disabled={reduced} wrapperClassName={block ? "block" : "inline-block"} innerClassName={block ? "block" : undefined}>{children}</Magnet>;
}
