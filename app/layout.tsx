import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Supavibe VPS Panel",
  description: "Self-hosted single VPS deployment dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
