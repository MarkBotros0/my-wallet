import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import Navbar from "./components/Navbar";
import BottomTabBar from "./components/BottomTabBar";
import ServiceWorkerRegistrar from "./components/ServiceWorkerRegistrar";
import { AuthProvider } from "./components/AuthProvider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
};

export const metadata: Metadata = {
  title: "My Wallet",
  description:
    "Track your expenses and income, and work out what you can really afford to buy.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "My Wallet",
  },
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/wallet-favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/wallet-favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/wallet-apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen flex flex-col">
        <ServiceWorkerRegistrar />
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          {/* The footer clears the floating pill nav through the one shared
              variable rather than a hardcoded bottom padding. */}
          <footer
            className="pt-4 text-center text-xs text-white/40"
            style={{ paddingBottom: "calc(var(--bottom-nav-clearance) + 1rem)" }}
          >
            By Mark Botros
          </footer>
          <BottomTabBar />
        </AuthProvider>
      </body>
    </html>
  );
}
