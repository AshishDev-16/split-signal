import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Split Signal — Cooperative Deduction",
  description: "A live asymmetric deduction game where every player holds a different piece of the answer.",
  applicationName: "Split Signal",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Split Signal",
    description: "Your clues are different. Your answer must be the same.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#070b12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
