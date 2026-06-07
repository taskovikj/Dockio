import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dockio",
  description: "Self-hosted VPS deployment dashboard",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
