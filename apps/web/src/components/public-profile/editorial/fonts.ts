import { Bricolage_Grotesque, Instrument_Sans, Spline_Sans_Mono } from 'next/font/google';

/**
 * The landing site's type system (apps/landing/src/app/layout.tsx), loaded only
 * by the public profile so the rest of the web app keeps its own fonts.
 */
export const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--pf-display', display: 'swap' });
export const sans = Instrument_Sans({ subsets: ['latin'], variable: '--pf-sans', display: 'swap' });
export const mono = Spline_Sans_Mono({ subsets: ['latin'], variable: '--pf-mono', display: 'swap' });

export const fontVars = `${display.variable} ${sans.variable} ${mono.variable}`;
