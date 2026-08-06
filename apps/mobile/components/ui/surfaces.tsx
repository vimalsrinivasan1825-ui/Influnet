/**
 * Screen / Card / SectionCard / Divider — the containers everything sits in.
 */
import type { ReactNode } from 'react';
import {
  RefreshControl,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';
import { GradientBackground } from './gradient';

/** Page wrapper: app background + safe-area aware bottom padding. */
export function Screen({
  children,
  style,
  padded = true,
  gradient = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  /**
   * The brand wash behind the top of the page. On by default — it is what
   * carries the theme onto screens that are otherwise white cards on grey.
   */
  gradient?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: t.color.surface,
          paddingHorizontal: padded ? t.spacing.screen : 0,
        },
        style,
      ]}
    >
      {gradient ? <GradientBackground /> : null}
      {children}
    </View>
  );
}

/** Scrolling page body with pull-to-refresh built in. */
export function ScreenScroll({
  children,
  onRefresh,
  refreshing,
  padded = true,
  centerShort,
  header,
  contentContainerStyle,
  ...rest
}: ScrollViewProps & {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  padded?: boolean;
  /**
   * Screen title rendered inside the scroll flow rather than pinned above it.
   *
   * That matters with `centerShort`: a fixed header leaves the title stranded
   * at the top with a canyon between it and content floating at mid-screen.
   * Inside the flow, title and content centre together as one block.
   */
  header?: ReactNode;
  /**
   * Sit short content near the middle of the screen instead of pinned under
   * the header with a lake of white space below it.
   *
   * `flexGrow: 1` makes the content container fill the viewport, so
   * `justifyContent` can centre it — and the moment the content grows past one
   * screen the container is taller than the viewport, justifyContent stops
   * having anything to distribute, and it lands back at the top and scrolls
   * normally. One rule covers both cases with no measuring.
   */
  centerShort?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAwareScrollView
      // Transparent so the Screen's brand wash shows through. The opaque
      // background lives on Screen (and on the Stack's contentStyle for pushed
      // routes), never on the scroller itself.
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={[
        {
          paddingHorizontal: padded ? t.spacing.screen : 0,
          // Clear the tab bar so the last card isn't trapped under it.
          paddingBottom: insets.bottom + t.spacing['4xl'],
          gap: t.spacing.md,
        },
        centerShort
          ? {
              flexGrow: 1,
              justifyContent: 'center',
              // Bias the block above true centre. Dead centre reads as low,
              // because the eye weights the empty space below more heavily
              // than the same gap above.
              paddingBottom: insets.bottom + t.spacing['4xl'] * 3,
            }
          : null,
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      enableOnAndroid={true}
      extraScrollHeight={20}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={t.color.contentMuted}
          />
        ) : undefined
      }
      {...rest}
    >
      {/* The header carries its own screen gutter, so cancel the container's
          padding for it and let it run full-bleed. */}
      {header ? (
        <View style={{ marginHorizontal: padded ? -t.spacing.screen : 0 }}>{header}</View>
      ) : null}
      {children}
    </KeyboardAwareScrollView>
  );
}

export function Card({
  children,
  style,
  padded = true,
  raised,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  raised?: boolean;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.color.surfaceCard,
          borderRadius: t.radii.lg,
          borderWidth: 1,
          borderColor: t.color.hairline,
          padding: padded ? t.spacing.lg : 0,
          overflow: 'hidden',
        },
        raised ? t.shadows.card : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Card with a title row, and an optional action on the right. */
export function SectionCard({
  title,
  action,
  children,
  style,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <Card style={style}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: t.spacing.md,
        }}
      >
        <Txt variant="title3">{title}</Txt>
        {action}
      </View>
      {children}
    </Card>
  );
}

/** Section label above a group of cards. */
export function SectionLabel({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Txt
      variant="caption"
      tone="muted"
      style={{
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginTop: t.spacing.md,
        marginBottom: t.spacing.xs,
      }}
    >
      {children}
    </Txt>
  );
}

export function Divider({ style }: { style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ height: 1, backgroundColor: t.color.hairline }, style]} />;
}
