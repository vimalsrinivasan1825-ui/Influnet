/**
 * Bottom sheet — the app's default container for anything the web would put in
 * a modal, dropdown or side panel: filters, deal terms, stage actions,
 * confirmations.
 */
import { forwardRef, type ReactNode } from 'react';
import { View } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

export type SheetRef = BottomSheet;

/** Tap-to-dismiss scrim. */
function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />;
}

export const Sheet = forwardRef<
  BottomSheet,
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

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={!snapPoints}
      onClose={onClose}
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

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: t.color.hairline,
        backgroundColor: t.color.surfaceCard,
        paddingHorizontal: t.spacing.screen,
        paddingTop: t.spacing.md,
        paddingBottom: insets.bottom + t.spacing.md,
        gap: t.spacing.sm,
      }}
    >
      {children}
    </View>
  );
}
