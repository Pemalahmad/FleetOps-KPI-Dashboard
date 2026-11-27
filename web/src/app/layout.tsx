import type { Metadata } from "next";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";
import { EngineProvider } from "@/components/engine-provider";
import { TeamProvider } from "@/components/team-provider";
import { Shell } from "@/components/shell";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";


export const metadata: Metadata = {
  title: "FleetOps KPI · Garage & Operations",
  description:
    "A visual fleet garage for repair stages, registration, insurance, accident recovery and road-readiness checks, connected to tested fleet analytics.",
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// The Content Security Policy is written into every page by scripts/postbuild.mjs, after the build, so it can list the
// SHA-256 of each inline script instead of allowing 'unsafe-inline'. (Rendering it here would let React re-insert the
// unhashed policy on navigation.)

// Set the theme before paint: saved choice, else the system preference.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

// Clickjacking guard. GitHub Pages cannot send frame-ancestors, so a page framed by another site hides itself and
// tries to break out. Same-origin frames (the app's own previews) are allowed.
const frameGuard = `(function(){if(window.top===window.self)return;var ok=false;try{ok=window.top.location.origin===window.location.origin}catch(e){}if(!ok){document.documentElement.style.display='none';try{window.top.location.replace(window.location.href)}catch(e){}}})()`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`antialiased ${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <meta name="referrer" content="no-referrer" />
        <meta name="theme-color" content="#6366f1" />
        <link rel="manifest" href={`${BASE}/manifest.webmanifest`} />
        <link rel="icon" href={`${BASE}/icons/icon-192.png`} />
        <link rel="apple-touch-icon" href={`${BASE}/icons/icon-192.png`} />
        <script dangerouslySetInnerHTML={{ __html: frameGuard }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <EngineProvider>
          <TeamProvider><Shell>{children}</Shell></TeamProvider>
        </EngineProvider>
      </body>
    </html>
  );
}


