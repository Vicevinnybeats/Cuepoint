import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";
import { IntroSplash } from "./intro-splash";
import { RotatePrompt } from "@/components/RotatePrompt";

export const metadata: Metadata = {
  title: "Cuepoint",
  description: "A DJ app that behaves like Virtual DJ / Traktor Pro, in the browser.",
  applicationName: "Cuepoint",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Cuepoint" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    // iOS only uses PNG here; without it "Add to Home Screen" falls back to
    // a screenshot of the page.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="overscroll-none">
        <RegisterServiceWorker />
        <IntroSplash />
        <RotatePrompt />
        {children}
      </body>
    </html>
  );
}
