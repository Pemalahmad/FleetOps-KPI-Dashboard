import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { EngineProvider } from "@/components/engine-provider";
import { Shell } from "@/components/shell";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FleetOps KPI · Three Clocks",
  description:
    "Fleet operations KPIs connected as one network of exact identities and measured drivers. The tested SQL pipeline runs in your browser.",
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// What the page may load or contact. Scripts, workers, WASM, fonts and data all come from this site; the one outside
// connection allowed is NHTSA's VIN decoder, used only when the owner clicks "Decode". Even injected code could not
// send fleet data anywhere else.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data: https://vpic.nhtsa.dot.gov",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'self' blob:",
].join("; ");

// Set the theme before paint: saved choice, else the system preference.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP} />
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
