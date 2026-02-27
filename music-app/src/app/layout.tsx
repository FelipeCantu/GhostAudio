import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { PlayerProvider } from "@/context/PlayerContext";
import { ImportProvider } from "@/context/ImportContext";
import PlayerBar from "@/components/PlayerBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DiZC - The Future of Local Audio",
  description: "Experience bit-perfect playback, seamless CD ripping, and a stunning interface designed for audiophiles. Your music, uncompromised.",
  openGraph: {
    title: "DiZC - The Future of Local Audio",
    description: "Experience bit-perfect playback and seamless CD ripping. Your music, uncompromised.",
    url: "https://dizc.audio", // Placeholder standardizing on a domain
    siteName: "DiZC",
    images: [
      {
        url: "/og-image.jpg", // Placeholder for when they add one
        width: 1200,
        height: 630,
        alt: "DiZC Music Player Interface",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DiZC - High Fidelity Music Player",
    description: "Your local library, elevated. Bit-perfect audio and stunning design.",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <ImportProvider>
            <PlayerProvider>
              {children}
              <PlayerBar />
            </PlayerProvider>
          </ImportProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
