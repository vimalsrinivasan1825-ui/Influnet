import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans, Geist } from 'next/font/google';
import './globals.css';
import './business-dashboard-layout.css';
import './influencer-dashboard-home.css';
import './dashboard-sidebar-hover.css';
import './dashboard-sidebar-logo.css';
import './dashboard-fonts.css';
import './connections-workspace.css';
import './projects-workspace.css';
import './business-messages-standalone.css';
import { Suspense } from 'react';
import { cn } from "@/lib/utils";
import { Toaster } from 'sonner';
import { ObservabilityProvider } from '@/components/observability-provider';
import { OpenInAppBanner } from '@/components/open-in-app-banner';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Influnet — The Business OS for Influencers & Brands',
  description:
    'Manage collaborations, campaigns, business communication, and partnerships — all from one professional platform.',
  openGraph: {
    title: 'Influnet — The Business OS for Influencers & Brands',
    description:
      'Manage collaborations, campaigns, business communication, and partnerships — all from one professional platform.',
    type: 'website',
  },
  twitter: {
    title: 'Influnet',
    description: 'Where influence meets opportunity.',
    card: 'summary',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", inter.variable, plusJakarta.variable, "font-sans", geist.variable)}
    >
      <body className="min-h-[100dvh] flex flex-col bg-background text-foreground">
        {children}
        <Toaster richColors position="top-right" />
        <OpenInAppBanner />
        {/*
          Suspense is required, not optional: ObservabilityProvider reads
          useSearchParams(), and without a boundary that opts the ENTIRE app
          out of static rendering. Analytics must not change how pages render.
        */}
        <Suspense fallback={null}>
          <ObservabilityProvider />
        </Suspense>
      </body>
    </html>
  );
}
