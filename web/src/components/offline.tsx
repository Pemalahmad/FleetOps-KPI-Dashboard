"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BASE } from "./engine-provider";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Register the service worker once, in production builds only (dev servers change files constantly). */
export function OfflineRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${BASE}/sw.js`, { scope: `${BASE}/` }).catch(() => undefined);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallPrompt;
      notify();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}

export function useInstallPrompt() {
  const can = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => deferred !== null, () => false);
  return {
    canInstall: can,
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      notify();
      return outcome === "accepted";
    },
  };
}

/** Ask the worker to keep the document reader (OCR + PDF) offline too. */
export async function cacheDocumentReader(): Promise<number> {
  const reg = await navigator.serviceWorker?.ready;
  if (!reg?.active) throw new Error("Offline mode starts after the first full visit of the published app.");
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out while downloading the document reader.")), 120000);
    navigator.serviceWorker.addEventListener("message", function onMsg(e) {
      if (e.data?.type === "ocr-cached") {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("message", onMsg);
        resolve(e.data.files);
      }
    });
    reg.active!.postMessage("cache-ocr");
  });
}
