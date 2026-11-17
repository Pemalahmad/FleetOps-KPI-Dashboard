import type { Metadata } from "next";
import type { ReactNode } from "react";
import "katex/dist/katex.min.css";
import "./globals.css";
import { EngineProvider } from "@/components/engine-provider";
import { Shell } from "@/components/shell";


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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <meta name="referrer" content="no-referrer" />
        <meta name="theme-color" content="#6366f1" />
        <link rel="manifest" href={`${BASE}/manifest.webmanifest`} />
        <link rel="icon" href={`${BASE}/icons/icon-192.png`} />
        <link rel="apple-touch-icon" href={`${BASE}/icons/icon-192.png`} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <EngineProvider>
          <Shell>{children}</Shell>
        </EngineProvider>
      </body>
    </html>
  );
}


