/**
 * The patterned paper behind a conversation.
 *
 * ── WHY A CHAT GETS A TEXTURE WHEN NOTHING ELSE DOES ──────────────────
 *
 * Every other screen in this app is white cards on a flat ground, and that is
 * right for screens you scan. A thread is not scanned, it is read, and it is
 * the one place where two people's words alternate down a single column with
 * no cards to separate them. The texture does two jobs there: it makes the
 * bubbles read as objects ON something rather than as floating rectangles, and
 * it marks the thread as a different KIND of screen the moment it opens —
 * which is exactly why every messenger has one.
 *
 * Warm neutral rather than a tint of the role accent. The bubbles are already
 * the accent at full strength; a pink ground under pink bubbles collapses the
 * contrast that tells you which messages are yours.
 *
 * ── DRAWN, NOT SHIPPED ────────────────────────────────────────────────
 *
 * A tiled PNG would be the obvious approach and is the wrong one here: it is
 * bundle weight, it needs an @2x and an @3x, and it cannot re-tint. This is
 * one `react-native-svg` <Pattern> — already a dependency, sharp at any
 * density, and the ink opacity is a number rather than a re-export.
 *
 * The doodles are deliberately generic — envelopes, stars, hearts, a paper
 * plane. Anything representational of THIS product would be an advert running
 * underneath someone's private conversation.
 */
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useState, type ReactNode } from 'react';
import Svg, { Defs, G, Path, Pattern, Rect } from 'react-native-svg';

/** The warm paper tone. Fixed — see the note about role accent above. */
export const PAPER_BG = '#F1EAE3';

/** Faint enough to sit under text at 4.5:1, present enough to read as texture. */
const INK = '#0f172a';
const INK_OPACITY = 0.055;
const TILE = 140;

export function ChatPaper({
  enabled = true,
  children,
}: {
  /** Off falls back to the app's ordinary ground — see the display sheet. */
  enabled?: boolean;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };

  if (!enabled) return <>{children}</>;

  return (
    <View style={{ flex: 1, backgroundColor: PAPER_BG }} onLayout={onLayout}>
      {/* Behind the messages and inert. `pointerEvents="none"` matters: this
          covers the whole thread, and a decorative layer that swallows taps
          would make every bubble unresponsive. */}
      {size.width > 0 && size.height > 0 ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Svg width={size.width} height={size.height}>
            <Defs>
              <Pattern
                id="doodles"
                patternUnits="userSpaceOnUse"
                width={TILE}
                height={TILE}
              >
                <G
                  fill="none"
                  stroke={INK}
                  strokeOpacity={INK_OPACITY}
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* Envelope */}
                  <Path d="M14 22h20v14H14z" />
                  <Path d="m14 22 10 8 10-8" />
                  {/* Smile */}
                  <Path d="M96 19a9 9 0 1 1 0 18 9 9 0 0 1 0-18" />
                  <Path d="M92 30a5 5 0 0 0 8 0M93 25h.01M99 25h.01" />
                  {/* Paper plane */}
                  <Path d="m112 96 18-7-7 18-3-8z" />
                  {/* Heart */}
                  <Path d="M40 108c0-5 8-5 8 0s-8 9-8 9-8-4-8-9 8-5 8 0" />
                  {/* Star */}
                  <Path d="m72 60 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
                  {/* Lines */}
                  <Path d="M20 74h16M20 80h10" />
                  {/* Camera-ish box */}
                  <Path d="M104 122h18v10h-18z" />
                </G>
              </Pattern>
            </Defs>
            <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#doodles)" />
          </Svg>
        </View>
      ) : null}

      {children}
    </View>
  );
}
