import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  display: "swap",
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Influnet — Run creator collaborations like a business",
  description:
    "Influnet is where Indian brands and verified creators find each other, agree terms, and deliver campaigns — with every step on the record.",
  openGraph: {
    title: "Influnet — Run creator collaborations like a business",
    description:
      "Where brands and verified creators find each other, agree terms, and deliver campaigns — with every step on the record.",
    type: "website",
  },
  twitter: {
    title: "Influnet",
    description: "Run creator collaborations like a business.",
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${instrument.variable} ${splineMono.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
