/**
 * Screen / Card / SectionCard / Divider — the containers everything sits in.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { useKeyboard } from '@/lib/use-keyboard';
import { Txt } from './text';
import { GradientBackground } from './gradient';
import {
  KeyboardAvoider,
  RevealFocusedInputProvider,
  useScrollFocusedInputIntoView,
} from './keyboard-avoider';

/** Page wrapper: app background + safe-area aware bottom padding. */
export function Screen({
  children,
  style,
  padded = true,
  gradient = false,
  avoidKeyboard = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  /**
   * The brand wash behind the top of the page.
   *
   * OFF by default as of the flat redesign. The wash was doing two jobs and
   * failing both: it was meant to carry the theme onto screens that are
   * otherwise white cards on grey, but a coloured haze behind every surface
   * lowers the contrast of everything sitting on it, and it made the role
   * accent read as *background* rather than as the thing you press.
   *
   * The accent now arrives through content instead — the headline's second
   * line, buttons, badges, active states — which is stronger identity at
   * higher contrast. Anything that genuinely wants a tinted page (a celebration
   * or a takeover) opts in with `gradient`.
   */
  gradient?: boolean;
  /**
   * Squeeze the page into the space above the keyboard. On by default, which is
   * what makes this correct app-wide instead of on whichever screens someone
   * remembered to handle: every screen is a `Screen`, so every screen avoids
   * the keyboard without opting in.
   *
   * Turn it off only where the screen pins itself to the keyboard by other
   * means — the chat thread, whose composer is meant to ride the keyboard while
   * the message list stays put.
   */
  avoidKeyboard?: boolean;
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
      {/* Outside the avoider: the wash is decoration painted across the whole
          page, and should not be clipped upward with the content. */}
      {gradient ? <GradientBackground /> : null}
      {avoidKeyboard ? <KeyboardAvoider>{children}</KeyboardAvoider> : children}
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
  const kb = useKeyboard();

  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  // Live scroll position. Kept in a ref rather than state because the reveal
  // maths reads it from inside a measure callback, where a re-render would be
  // both useless and a dropped frame.
  const offsetRef = useRef(0);
  const reveal = useScrollFocusedInputIntoView(scrollRef, viewportRef, offsetRef);

  // The keyboard coming up is the one case where the viewport changes size
  // under a field that is already focused. Wait out the avoider's padding
  // animation first, or we measure the viewport mid-flight and scroll to where
  // it used to be.
  useEffect(() => {
    if (kb.shown) reveal(kb.duration + 60);
  }, [kb.shown, kb.top, kb.duration, reveal]);

  const { onScroll: onScrollProp, ...scrollProps } = rest;
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = e.nativeEvent.contentOffset.y;
      onScrollProp?.(e);
    },
    [onScrollProp],
  );

  return (
    <RevealFocusedInputProvider value={reveal}>
      {/*
        The avoider belongs to the scroller, not to `Screen`.

        Roughly two thirds of this app's screens render a bare `ScreenScroll`
        with no `Screen` around it — `edit-profile`, `search`, `feedback`,
        `settings`, the whole `projects/` tree. Mounting keyboard avoidance on
        `Screen` alone silently leaves every one of them with none, which is how
        a fix shipped as app-wide reached about a third of the app.

        Nesting is handled: where a `Screen` does wrap this, its avoider is the
        outer one and this becomes a passthrough, so a sticky footer that is a
        sibling of the scroll body still lifts with it.
      */}
      <KeyboardAvoider>
      {/* The measured viewport. `collapsable={false}` keeps Android from
          flattening it away, which would leave the reveal maths with no frame
          to measure against. */}
      <View ref={viewportRef} collapsable={false} style={{ flex: 1 }}>
    <ScrollView
      ref={scrollRef}
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
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={t.color.contentMuted}
          />
        ) : undefined
      }
      {...scrollProps}
      // After the spread: the scroll offset this tracks is what the reveal
      // maths scrolls relative to, so a caller's own `onScroll` composes with
      // it rather than replacing it.
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* The header carries its own screen gutter, so cancel the container's
          padding for it and let it run full-bleed. */}
      {header ? (
        <View style={{ marginHorizontal: padded ? -t.spacing.screen : 0 }}>{header}</View>
      ) : null}
      {children}
        </ScrollView>
      </View>
      </KeyboardAvoider>
    </RevealFocusedInputProvider>
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
