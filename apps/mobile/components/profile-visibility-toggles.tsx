/**
 * "What shows on your public profile" — three switches, mobile.
 *
 * Same three sections web's Settings page controls (Recent Instagram posts,
 * Recent YouTube videos, Portfolio), over the same field — profile_section_
 * visibility on influencer_profiles. Whichever surface a creator toggles from,
 * both read the same column, so flipping it here is what makes the browser
 * change too.
 *
 * Always sends the FULL 3-key object on every save, never a partial one — the
 * column is JSONB and a write replaces the whole value.
 */
import { Switch, View } from 'react-native';
import {
  PROFILE_SECTIONS,
  PROFILE_SECTION_LABELS,
  isSectionVisible,
  type ProfileSectionVisibility,
} from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { Card, Txt } from '@/components/ui';

const SECTION_HINT: Record<string, string> = {
  instagram_posts: 'The grid of your recent Instagram posts.',
  youtube_videos: 'Your latest uploads from YouTube.',
  portfolio: "The work you've chosen and added yourself.",
};

export function ProfileVisibilityToggles({
  visibility,
  savingKey,
  onChange,
}: {
  visibility: ProfileSectionVisibility;
  /** The section currently mid-save, so its row can show a disabled state rather than double-fire. */
  savingKey: string | null;
  onChange: (key: (typeof PROFILE_SECTIONS)[number], next: boolean) => void;
}) {
  const t = useTheme();

  return (
    <Card style={{ gap: t.spacing.md }}>
      <View style={{ gap: 2 }}>
        <Txt variant="bodyStrong">What shows on your public profile</Txt>
        <Txt variant="footnote" tone="muted">
          Turn a section off and it disappears from your public page — nothing is
          deleted, and switching it back on brings it straight back.
        </Txt>
      </View>

      {PROFILE_SECTIONS.map((key, i) => {
        const on = isSectionVisible(visibility, key);
        return (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: t.spacing.md,
              paddingTop: i > 0 ? t.spacing.sm : 0,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: t.color.hairline,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="footnote" style={{ fontWeight: '600' }}>
                {PROFILE_SECTION_LABELS[key]}
              </Txt>
              <Txt variant="caption" tone="muted">
                {SECTION_HINT[key]}
              </Txt>
            </View>
            <Switch
              value={on}
              disabled={savingKey === key}
              onValueChange={(next) => onChange(key, next)}
              trackColor={{ true: t.color.brand, false: t.color.hairlineStrong }}
              thumbColor={t.color.white}
              accessibilityLabel={`${on ? 'Hide' : 'Show'} ${PROFILE_SECTION_LABELS[key].toLowerCase()} on your public profile`}
            />
          </View>
        );
      })}
    </Card>
  );
}
