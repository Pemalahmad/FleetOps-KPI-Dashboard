"use client";
import { useSyncExternalStore } from "react";

/** Whether the page is in dark mode, kept in sync with the <html class="dark"> toggle. */
function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}
export function useTheme() {
  return useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains("dark"), () => false);
}

let software: boolean | null = null;
/** True when WebGL runs in software (no graphics card): heavy effects are skipped there. */
export function softwareGL(): boolean {
  if (software !== null) return software;
  try {
    const gl = document.createElement("canvas").getContext("webgl2") as WebGL2RenderingContext | null;
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    software = !gl || /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ""));
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { software = true; }
  return software;
}
const never = () => () => {};
/** softwareGL() as a hydration-safe hook (false on the server and on first paint). */
export function useSoftwareGL() {
  return useSyncExternalStore(never, softwareGL, () => true);
}
