/**
 * Live preview cards for the signup wizards: the profile (creator) or brand
 * card a person is building, filling in as they answer. They show the user's
 * own words back to them — no stock photo, no sample data once they've typed.
 *
 * Empty fields render as dashed slots naming the step that fills them, so the
 * card also reads as a map of what's still to come.
 */
import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Txt } from '@/components/ui';

function initialsOf(name: string, fallback: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

function Slot({ label, hint }: { label: string; hint: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        height: 36,
        borderRadius: 12,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: t.color.hairlineStrong,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Txt variant="footnote" tone="muted">{label}</Txt>
      <Txt variant="caption" tone="muted">{hint}</Txt>
    </View>
  );
}

function Tag({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: t.color.surface, justifyContent: 'center' }}>
      <Txt variant="footnote" style={{ fontWeight: '600' }}>{label}</Txt>
    </View>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.color.surfaceCard,
        borderRadius: t.radii.lg,
        padding: 18,
        gap: 14,
        ...t.shadows.raised,
      }}
    >
      {children}
    </View>
  );
}

export function CreatorPreview({
  name,
  username,
  niches = [],
  verified,
}: {
  name: string;
  username?: string;
  niches?: string[];
  verified?: boolean;
}) {
  const t = useTheme();
  return (
    <Shell>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            backgroundColor: t.color.brand,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt style={{ color: t.color.white, fontSize: 18, fontWeight: '800' }}>{initialsOf(name, 'You')}</Txt>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Txt variant="title3" numberOfLines={1} style={{ fontSize: 19, flexShrink: 1 }}>
              {name.trim() || 'Your name'}
            </Txt>
            {verified ? (
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: t.color.verified, alignItems: 'center', justifyContent: 'center' }}>
                <Check size={11} color={t.color.white} strokeWidth={3.4} />
              </View>
            ) : null}
          </View>
          <Txt variant="footnote" numberOfLines={1} style={{ color: username ? t.color.brand : t.color.contentMuted, fontWeight: '600' }}>
            {username ? `influnet.io/${username}` : 'Creator'}
          </Txt>
        </View>
      </View>
      {niches.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {niches.slice(0, 4).map((n) => <Tag key={n} label={n} />)}
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {!username ? <Slot label="Profile link" hint="next" /> : null}
          <Slot label="Socials" hint="coming up" />
          <Slot label="What you create" hint="coming up" />
        </View>
      )}
    </Shell>
  );
}

export function BrandPreview({
  company,
  username,
  industry,
}: {
  company: string;
  username?: string;
  industry?: string;
}) {
  const t = useTheme();
  return (
    <Shell>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 54,
            height: 54,
            borderRadius: 18,
            backgroundColor: '#e2703a',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Txt style={{ color: t.color.white, fontSize: 18, fontWeight: '800' }}>{initialsOf(company, 'Co')}</Txt>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Txt variant="title3" numberOfLines={1} style={{ fontSize: 19 }}>
            {company.trim() || 'Your brand'}
          </Txt>
          <Txt variant="footnote" numberOfLines={1} style={{ color: username ? t.color.brand : t.color.contentMuted, fontWeight: '600' }}>
            {username ? `influnet.io/${username}` : 'Business'}
          </Txt>
        </View>
      </View>
      {industry ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Tag label={industry} />
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Slot label="Industry" hint="coming up" />
          <Slot label="Budget & content" hint="coming up" />
        </View>
      )}
    </Shell>
  );
}
