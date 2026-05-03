import type { Metadata, Viewport } from "next";

import { AchievementReveal } from "@/components/effects/AchievementReveal";
import { BackgroundParticles } from "@/components/effects/BackgroundParticles";
import { CommandPalette } from "@/components/effects/CommandPalette";
import { Konami } from "@/components/effects/Konami";
import { NoiseOverlay } from "@/components/effects/NoiseOverlay";
import { PlasmaCursor } from "@/components/effects/PlasmaCursor";
import { ShortcutsOverlay } from "@/components/effects/ShortcutsOverlay";
import { Toaster } from "@/components/effects/Toaster";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { apiServerOptional } from "@/lib/api";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import type { UserPublic } from "@/lib/types";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "endless·war — CS 1.6 jail community",
    template: "%s — endless·war",
  },
  description:
    "Форум сообщества endless·war. CS 1.6 jail mode: обсуждения, бан-апелляции, заявки в админы, статистика игроков.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  openGraph: {
    title: "endless·war",
    description: "CS 1.6 jail community forum",
    type: "website",
    locale: "ru_RU",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0a0b14",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

// Inline script to apply theme attribute synchronously, before paint, to
// avoid a flash of default theme on hydration.
const themeBoot = `
(function() {
  try {
    var t = localStorage.getItem('ew_theme') || 'plasma';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await apiServerOptional<UserPublic>("/auth/me");

  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="flex min-h-screen flex-col">
        {/* Background effects (z=-10) */}
        <BackgroundParticles />
        {/* Noise grain (z=2) */}
        <NoiseOverlay />
        {/* Custom cursor (z=9999) */}
        <PlasmaCursor />

        <ThemeProvider>
          <AuthProvider initialUser={user}>
            <Header />
            <main className="relative z-[3] flex-1">{children}</main>
            <Footer />

            {/* Power-user / easter-egg surfaces */}
            <CommandPalette />
            <ShortcutsOverlay />
            <AchievementReveal />
            <Konami />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
