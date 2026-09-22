import type { ReactNode } from 'react';

// The logical size of the screen we draw into: an iPhone 15 / 16 in points.
// Screens are authored at this size and scaled to fit the frame, so type and
// spacing keep the app's real proportions at any frame width.
export const SCREEN_W = 393;
export const SCREEN_H = 852;

const RIM = 3; // titanium edge
const BEZEL = 9; // black glass border around the display

type Props = {
  /** Outer width of the device in CSS pixels. */
  width?: number;
  /** A real screenshot (393×852 or any 9:19.5 image). Wins over children. */
  src?: string;
  alt?: string;
  children?: ReactNode;
  className?: string;
};

// A drawn iPhone: titanium rim, side buttons, Dynamic Island, status bar and a
// glass sheen. Drawn rather than an image so it stays crisp at any size and
// carries no third-party mockup licence.
export default function IPhoneFrame({ width = 300, src, alt = '', children, className = '' }: Props) {
  const inner = width - 2 * (RIM + BEZEL);
  const scale = inner / SCREEN_W;
  const innerH = SCREEN_H * scale;
  const height = innerH + 2 * (RIM + BEZEL);
  const outerR = width * 0.17;
  const innerR = outerR - RIM - BEZEL + 2;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width, height }}>
      {/* Side buttons: action + volume on the left, power on the right. */}
      <span className="absolute -left-[2px] w-[3px] rounded-l-sm bg-gradient-to-b from-[#9a97a0] to-[#5d5a63]" style={{ top: height * 0.17, height: height * 0.045 }} />
      <span className="absolute -left-[2px] w-[3px] rounded-l-sm bg-gradient-to-b from-[#9a97a0] to-[#5d5a63]" style={{ top: height * 0.245, height: height * 0.085 }} />
      <span className="absolute -left-[2px] w-[3px] rounded-l-sm bg-gradient-to-b from-[#9a97a0] to-[#5d5a63]" style={{ top: height * 0.35, height: height * 0.085 }} />
      <span className="absolute -right-[2px] w-[3px] rounded-r-sm bg-gradient-to-b from-[#9a97a0] to-[#5d5a63]" style={{ top: height * 0.27, height: height * 0.13 }} />

      {/* Titanium rim */}
      <div
        className="absolute inset-0 bg-[linear-gradient(145deg,#d9d6de_0%,#7d7a83_22%,#3b3940_50%,#8a8790_78%,#cfccd4_100%)] shadow-[0_50px_100px_-30px_rgba(23,20,29,.6),0_30px_60px_-40px_rgba(23,20,29,.5)]"
        style={{ borderRadius: outerR, padding: RIM }}
      >
        {/* Black bezel */}
        <div className="h-full w-full bg-[#050506]" style={{ borderRadius: outerR - RIM, padding: BEZEL }}>
          {/* Display */}
          <div className="relative h-full w-full overflow-hidden bg-white" style={{ borderRadius: innerR }}>
            {src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt} className="h-full w-full object-cover object-top" />
            ) : (
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={{
                  width: SCREEN_W,
                  height: SCREEN_H,
                  transform: `scale(${scale})`,
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
                }}
              >
                <StatusBar />
                {children}
              </div>
            )}

            {/* Dynamic Island */}
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black"
              style={{ top: 11 * scale, width: 124 * scale, height: 36 * scale }}
            />
            {/* Glass sheen */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,.14)_0%,rgba(255,255,255,0)_32%,rgba(255,255,255,0)_70%,rgba(255,255,255,.06)_100%)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="absolute inset-x-0 top-0 z-10 flex h-[54px] items-center justify-between px-[34px] pt-1 text-[17px] font-semibold text-[#0f172a]">
      <span className="w-[54px] text-center tracking-[-0.02em]">9:41</span>
      <span className="flex items-center gap-[7px]">
        <svg width="19" height="12" viewBox="0 0 19 12" fill="currentColor" aria-hidden>
          <rect x="0" y="8" width="3.2" height="4" rx="1" />
          <rect x="5" y="5.5" width="3.2" height="6.5" rx="1" />
          <rect x="10" y="3" width="3.2" height="9" rx="1" />
          <rect x="15" y="0" width="3.2" height="12" rx="1" />
        </svg>
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" aria-hidden>
          <path d="M8.5 2.6c2.3 0 4.4.9 6 2.4l1.2-1.2A10.2 10.2 0 0 0 8.5.9 10.2 10.2 0 0 0 1.3 3.8L2.5 5a8.6 8.6 0 0 1 6-2.4Zm0 3.4c1.4 0 2.6.5 3.6 1.4l1.2-1.2a6.8 6.8 0 0 0-9.6 0l1.2 1.2c1-.9 2.2-1.4 3.6-1.4Zm0 3.4c.5 0 .9.2 1.2.5L8.5 11.1 7.3 9.9c.3-.3.7-.5 1.2-.5Z" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13" aria-hidden>
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.8" fill="none" stroke="currentColor" opacity=".4" />
          <rect x="2" y="2" width="20" height="9" rx="2.5" fill="currentColor" />
          <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2Z" fill="currentColor" opacity=".45" />
        </svg>
      </span>
    </div>
  );
}
