import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GYM & FOOD — Allenamento e nutrizione",
  description: "Allenamenti personalizzati, nutrizione, progressi e salute in un’unica web app.",
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
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  );
}
