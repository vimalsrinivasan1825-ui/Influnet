/**
 * Keyboard avoidance, done by measuring instead of guessing.
 *
 * The rule: whatever this wraps is squeezed into the space *above* the
 * keyboard. It measures its own bottom edge in window coordinates, compares it
 * to the keyboard's top edge, and pads by exactly the overlap — so a scroll
 * body and a sticky footer inside it both end up sitting on the keyboard, and
 * come back down when it dismisses.
 *
 * Why measure rather than pad by the keyboard's height, the way RN's
 * `KeyboardAvoidingView` does with a hand-tuned `keyboardVerticalOffset`? Two
 * reasons, and both have already bitten this app:
 *
 *  - The height is only the right answer when the wrapped view's bottom edge is
 *    also the window's bottom edge. Under a tab bar, or inside a modal, it
 *    over-pads by exactly the difference and leaves a dead band of blank space.
 *  - On Android with `edgeToEdgeEnabled`, whether the OS resizes the window for
 *    the IME varies by version and OEM. If it *does* resize, our own frame has
 *    already moved up, the measured overlap comes out near zero, and we
 *    correctly add nothing. Height-based padding would double it. The
 *    measurement is self-correcting; a constant cannot be.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { Animated, TextInput, View, type ViewStyle } from 'react-native';
import { useKeyboard } from '@/lib/use-keyboard';

/**
 * Lets a text field ask the scroller above it to reveal whatever is focused.
 *
 * Focus moving between two fields while the keyboard is already up fires no
 * keyboard event at all, so the scroller has nothing to react to on its own.
 * `Field` calls this on focus to close that gap. Default is a no-op so a field
 * rendered outside any scroller is legal rather than a crash.
 */
export type RevealFocusedInput = (delayMs?: number) => void;

const RevealContext = createContext<RevealFocusedInput>(() => {});

export const RevealFocusedInputProvider = RevealContext.Provider;

export function useRevealFocusedInput() {
  return useContext(RevealContext);
}

/**
 * True inside an avoider that is already doing the work.
 *
 * `Screen` mounts one for every page, and a few components — `Wizard`, the
 * chat thread — mount their own because they are the root of their route. Where
 * those meet, the inner one must stand down. Nesting two would be *nearly*
 * harmless, since the inner one measures a bottom edge the outer has already
 * lifted and would compute an overlap of zero — but only once the outer's
 * animation has finished. During the animation it measures the old position and
 * pads again, so the content visibly overshoots and settles back.
 */
const NestedContext = createContext(false);

export function KeyboardAvoider({
  children,
  enabled = true,
  style,
}: {
  children: ReactNode;
  /** Off for screens that manage the keyboard themselves. */
  enabled?: boolean;
  style?: ViewStyle;
}) {
  const nested = useContext(NestedContext);
  const kb = useKeyboard();
  const frameRef = useRef<View>(null);
  const pad = useRef(new Animated.Value(0)).current;

  const active = enabled && !nested;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const applyOverlap = (overlap: number) => {
      if (cancelled) return;
      Animated.timing(pad, {
        toValue: Math.max(0, overlap),
        duration: kb.duration,
        // Padding is a layout prop, so this cannot run on the native driver.
        useNativeDriver: false,
      }).start();
    };

    if (!kb.shown) {
      applyOverlap(0);
      return;
    }

    frameRef.current?.measureInWindow((_x, y, _w, height) => {
      applyOverlap(y + height - kb.top);
    });

    return () => {
      cancelled = true;
    };
  }, [active, kb.shown, kb.top, kb.duration, pad]);

  if (!active) {
    // Still render the box so `style` and the layout tree are unchanged —
    // standing down means not padding, not disappearing.
    return <View style={[{ flex: 1 }, style]}>{children}</View>;
  }

  return (
    // Two views on purpose. The outer one is what we measure, and its frame
    // must not move when we pad — so the padding goes on the inner one, whose
    // `flex: 1` makes it fill the outer exactly.
    //
    // `collapsable={false}` keeps Android from optimising the outer view out of
    // the native hierarchy, which would leave `measureInWindow` with nothing to
    // measure and silently disable the whole mechanism.
    <View ref={frameRef} collapsable={false} style={[{ flex: 1 }, style]}>
      <Animated.View style={{ flex: 1, paddingBottom: pad }}>
        <NestedContext.Provider value>{children}</NestedContext.Provider>
      </Animated.View>
    </View>
  );
}

/**
 * Scrolls the focused input into view inside a scroller whose viewport has
 * already been shrunk by `KeyboardAvoider`.
 *
 * Reads the focused input from `TextInput.State` rather than requiring every
 * call site to pass a ref, so inputs that don't go through `Field` — the OTP
 * boxes, the chat composer — are covered by the same code.
 */
export function useScrollFocusedInputIntoView(
  scrollRef: React.RefObject<{ scrollTo: (o: { y: number; animated: boolean }) => void } | null>,
  viewportRef: React.RefObject<View | null>,
  offsetRef: React.RefObject<number>,
) {
  return useCallback<RevealFocusedInput>(
    (delayMs = 0) => {
      const run = () => {
        const input = TextInput.State.currentlyFocusedInput();
        if (!input || !viewportRef.current) return;

        viewportRef.current.measureInWindow((_vx, vy, _vw, vh) => {
          input.measureInWindow?.((_ix: number, iy: number, _iw: number, ih: number) => {
            // Breathing room so the field isn't flush against the keyboard, and
            // the next field down is hinted at.
            const margin = 24;
            const viewportTop = vy;
            const viewportBottom = vy + vh;

            let delta = 0;
            if (iy + ih + margin > viewportBottom) {
              delta = iy + ih + margin - viewportBottom;
            } else if (iy - margin < viewportTop) {
              // Field is above the fold — usually because focus jumped
              // backwards up the form.
              delta = iy - margin - viewportTop;
            }
            if (delta === 0) return;

            scrollRef.current?.scrollTo({
              y: Math.max(0, (offsetRef.current ?? 0) + delta),
              animated: true,
            });
          });
        });
      };

      // The caller passes a delay when it needs the avoider's padding animation
      // to settle first — measuring mid-animation aims at where the viewport
      // was, not where it is landing.
      if (delayMs > 0) setTimeout(run, delayMs);
      else requestAnimationFrame(run);
    },
    [scrollRef, viewportRef, offsetRef],
  );
}
