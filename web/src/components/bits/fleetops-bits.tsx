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
