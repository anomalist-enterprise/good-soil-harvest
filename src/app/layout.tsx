import type { Metadata } from "next";
import { Lora, Inter } from "next/font/google";
import { siteConfig } from "@/lib/config";
import { Providers } from "@/components/Providers";
import { StripeSandboxBanner } from "@/components/layout/StripeSandboxBanner";
import { BottomNav } from "@/components/pwa/BottomNav";
import "./globals.css";

const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  metadataBase: new URL(siteConfig.url),
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: siteConfig.url,
    siteName: siteConfig.name,
  },
  twitter: {
    card: "summary_large_image",
    site: siteConfig.handle,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Good Soil Harvest",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  themeColor: "#2e1a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${lora.variable} ${inter.variable}`}>
      <head>
        <meta name="google-site-verification" content="pBapuREGkfUODrGjct6ajmIx36u8c8GpyDy3FumjoVQ" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {process.env.NEXT_PUBLIC_ADSENSE_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="min-h-screen flex flex-col">
        {/^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY ?? "") && <StripeSandboxBanner />}
        <Providers>
          {children}
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
