/**
 * Where the keyboard is, in window coordinates.
 *
 * Every previous attempt at keyboard avoidance in this app guessed: a
 * `keyboardVerticalOffset={100}` here, an `extraScrollHeight={20}` there. Those
 * numbers are wrong the moment a header changes height, or the device has a
 * different bottom inset, or the user swaps to a taller IME with a suggestion
 * strip. The fix is to stop guessing and read the one number the OS actually
 * tells us: `endCoordinates.screenY`, the Y of the keyboard's top edge in
 * window space. Anything that needs to sit above the keyboard can then be
 * measured against that directly.
 *
 * iOS fires `keyboardWillShow` before the animation, with a duration we can
 * match so our layout moves in step with the keyboard rather than snapping
 * after it. Android has no reliable `will` event, so it uses `did`.
 */
import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

export type KeyboardMetrics = {
  /**
   * Y coordinate of the keyboard's top edge, in window space.
   *
   * `Infinity` while hidden, so `somethingsBottom - top` is always negative and
   * overlap maths needs no `shown` check to stay correct.
   */
  top: number;
  height: number;
  shown: boolean;
  /** Animation duration the OS is using, in ms. Match it and the move reads as
   *  one motion instead of two. */
  duration: number;
};

const HIDDEN: KeyboardMetrics = {
  top: Number.POSITIVE_INFINITY,
  height: 0,
  shown: false,
  duration: 250,
};

export function useKeyboard(): KeyboardMetrics {
  const [metrics, setMetrics] = useState<KeyboardMetrics>(HIDDEN);

  useEffect(() => {
    // `will` events on iOS only. On Android they either never fire or fire with
    // a zero-height frame depending on the OEM's IME, so `did` is the honest
    // choice there even though it lands a frame later.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      const { screenY, height } = e.endCoordinates;
      // `keyboardWillChangeFrame` also fires on the way *out*, with the frame
      // parked just below the screen. Deriving `shown` from the geometry rather
      // than from which event arrived keeps a dismissal from being read as a
      // presentation, whichever order the pair lands in.
      const offscreen = height <= 0 || screenY >= Dimensions.get('window').height;
      setMetrics({
        top: offscreen ? Number.POSITIVE_INFINITY : screenY,
        height: offscreen ? 0 : height,
        shown: !offscreen,
        // Android reports 0 here; a 0ms animation is a jump cut, so floor it.
        duration: e.duration || 250,
      });
    };

    const onHide = (e: KeyboardEvent) => {
      setMetrics({ ...HIDDEN, duration: e?.duration || 250 });
    };

    const subs = [
      Keyboard.addListener(showEvent, onShow),
      Keyboard.addListener(hideEvent, onHide),
      // A hardware keyboard, or an IME resizing itself (emoji panel, autofill
      // bar appearing) changes the frame without a show/hide pair.
      ...(Platform.OS === 'ios'
        ? [Keyboard.addListener('keyboardWillChangeFrame', onShow)]
        : []),
    ];

    return () => subs.forEach((s) => s.remove());
  }, []);

  return metrics;
}
