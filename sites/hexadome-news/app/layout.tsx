import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ESP32 Tabletop Companion",
  description: "Configure initiative and pixel art over USB and control your ESP32 screens by Bluetooth.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
