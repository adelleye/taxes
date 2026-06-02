import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// DM Sans is the product typeface (self-hosted, subset, size-adjust fallback so
// it swaps in without layout shift). The display serif is system Times New
// Roman (var(--serif) in globals.css) — no web font to load.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-dm-sans"
});

export const metadata: Metadata = {
  title: "Nigeria Tax Workbench",
  description: "Deterministic internal tax review workbench for Nigerian company cases."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}
