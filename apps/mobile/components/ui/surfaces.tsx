/**
 * Screen / Card / SectionCard / Divider — the containers everything sits in.
 */
import type { ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { Txt } from './text';

/** Page wrapper: app background + safe-area aware bottom padding. */
export function Screen({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
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
  contentContainerStyle,
  ...rest
}: ScrollViewProps & {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  padded?: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.color.surface }}
      contentContainerStyle={[
        {
          paddingHorizontal: padded ? t.spacing.screen : 0,
          // Clear the tab bar so the last card isn't trapped under it.
          paddingBottom: insets.bottom + t.spacing['4xl'],
          gap: t.spacing.md,
        },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
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
      {children}
    </ScrollView>
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
