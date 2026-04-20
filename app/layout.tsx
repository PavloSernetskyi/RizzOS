import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rizzy — RizzOS",
  description:
    "Talk to Rizzy. A voice-first AI personality built on RizzOS.",
  metadataBase: new URL("https://rizzos.app"),
  openGraph: {
    title: "Rizzy — RizzOS",
    description: "Talk to Rizzy. A voice-first AI personality built on RizzOS.",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#05060a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-[100dvh] antialiased">
        <div className="ambient" aria-hidden />
        {children}
      </body>
    </html>
  );
}
