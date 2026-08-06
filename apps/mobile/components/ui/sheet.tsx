/**
 * Bottom sheet — the app's default container for anything the web would put in
 * a modal, dropdown or side panel: filters, deal terms, stage actions,
 * confirmations.
 */
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useKeyboard } from '@/lib/use-keyboard';
import { Txt } from './text';

/**
 * Only `expand` and `close` are exposed — the two methods every caller in the
 * app actually uses. The sheet does not exist until `expand()`, so a wider
 * surface (collapse/snapToIndex/…) would have nothing to act on.
 */
export type SheetRef = { expand: () => void; close: () => void };

/** Tap-to-dismiss scrim. */
function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />;
}

export const Sheet = forwardRef<
  SheetRef,
  {
    title?: string;
    children: ReactNode;
    /** Fractions or points, e.g. ['50%'] — omit for content-height sizing. */
    snapPoints?: (string | number)[];
    onClose?: () => void;
  }
>(function Sheet({ title, children, snapPoints, onClose }, ref) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const inner = useRef<BottomSheet>(null);

  /**
   * The sheet is mounted only while it is open, and opens at index 0 rather
   * than mounting closed at index -1 and waiting to be expanded.
   *
   * A permanently-mounted `index={-1}` sheet has to resolve its own position,
   * and with `enableDynamicSizing` that resolution cannot finish until the
   * content has measured itself. In that window the sheet is on screen with
   * no settled detent, which is how Settings' "Delete your account?"
   * confirmation ended up peeking above the bottom edge — half-open, with
   * nothing pressed, ready to be swiped up. Moving it out of the ScrollView
   * changed how far it travelled but not that it appeared at all, because the
   * cause is the mount, not the parent.
   *
   * Not rendering it until `expand()` removes the window rather than
   * narrowing it: before the first tap there is no sheet to place, and after
   * it, opening at index 0 is the library's own animate-on-mount path, which
   * already waits for layout.
   */
  const [open, setOpen] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      expand: () => setOpen(true),
      // Animate out when it is on screen; `handleClose` unmounts it once the
      // animation lands. With nothing mounted there is nothing to animate.
      close: () => (inner.current ? inner.current.close() : setOpen(false)),
    }),
    []
  );

  const handleClose = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  if (!open) return null;

  return (
    <BottomSheet
      ref={inner}
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={!snapPoints}
      onClose={handleClose}
      backdropComponent={Backdrop}
      handleIndicatorStyle={{ backgroundColor: t.color.hairlineStrong, width: 40 }}
      backgroundStyle={{
        backgroundColor: t.color.surfaceCard,
        borderTopLeftRadius: t.radii.xl,
        borderTopRightRadius: t.radii.xl,
      }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: t.spacing.xl,
          paddingBottom: insets.bottom + t.spacing.xl,
          gap: t.spacing.md,
        }}
      >
        {title ? (
          <Txt variant="title2" style={{ marginBottom: t.spacing.xs }}>
            {title}
          </Txt>
        ) : null}
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
});

/** Sticky footer inside a screen — sign-off bars, primary CTAs. */
export function StickyFooter({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const kb = useKeyboard();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: t.color.hairline,
        backgroundColor: t.color.surfaceCard,
        paddingHorizontal: t.spacing.screen,
        paddingTop: t.spacing.md,
        // The bottom inset clears the home indicator. With the keyboard up the
        // keyboard is what sits there, and `KeyboardAvoider` has already lifted
        // this footer clear of it — keeping the inset would just wedge a strip
        // of dead space between the button and the keys.
        paddingBottom: (kb.shown ? 0 : insets.bottom) + t.spacing.md,
        gap: t.spacing.sm,
      }}
    >
      {children}
    </View>
  );
}
