/**
 * Add past work to the portfolio.
 *
 * One required field: the link. Everything the server can work out from it —
 * which platform it is, the thumbnail, and for YouTube the real video title —
 * is derived on POST (lib/portfolio-link.ts), so the common case is paste,
 * name the brand, save.
 *
 * The screen is deliberately explicit that this is self-reported. A creator
 * adding their own work is making a claim, and the card it produces says so;
 * pretending otherwise would put unverified entries next to real completed
 * projects with nothing to tell them apart.
 */
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BadgeCheck, Info } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { invalidateFetchCache } from '@/lib/use-fetch';
import { useEntitlements } from '@/lib/use-entitlements';
import {
  Button,
  Card,
  Field,
  Screen,
  ScreenScroll,
  Txt,
} from '@/components/ui';

/**
 * Mirrors the hosts lib/portfolio-link.ts accepts, for the pre-flight hint.
 *
 * The Instagram copy used to say "recent posts bring their own picture" — true,
 * but it didn't say WHOSE "recent" or WHY: Instagram has required a Facebook
 * app token for its oEmbed thumbnail since 2020, so nobody can fetch a picture
 * for an arbitrary pasted link, ours included (see lib/portfolio-thumbnail.ts
 * on the server for the full story and what was tried). The only picture this
 * can ever produce is one already sitting in OUR OWN cache of this creator's
 * most recent Instagram posts — the same snapshot "Refresh my numbers" on this
 * tab writes. Spelling that out here is what turns "it's not fetching the
 * thumbnail" into an expected, explained outcome instead of a silent failure.
 */
function platformHint(url: string): string | null {
  const u = url.trim().toLowerCase();
  if (!u) return null;
  if (u.includes('youtube.com') || u.includes('youtu.be')) {
    return 'YouTube — we’ll pull the title and thumbnail automatically.';
  }
  if (u.includes('instagram.com')) {
    return 'Instagram — give it a title below. We can only get a picture for one of your dozen most recent posts (from your last "Refresh my numbers"); anything older shows a plain tile instead.';
  }
  return null;
}

export default function AddPortfolioItemScreen() {
  const t = useTheme();
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { entitlements, isPro } = useEntitlements();

  const portfolioLimit = entitlements?.limits.portfolioItems ?? null;
  const atCap =
    !!entitlements?.subscriptionsEnabled &&
    typeof portfolioLimit === 'number' &&
    entitlements.usage.portfolioItems >= portfolioLimit;

  const hint = platformHint(url);
  const canSave = url.trim().length > 3 && !saving && !atCap;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const res = await endpoints.addPortfolioItem<{
      item?: { platform?: string; thumbnail_url?: string | null };
      error?: string;
    }>({
      url: url.trim(),
      title: title.trim() || undefined,
      brand_name: brand.trim() || undefined,
    });

    setSaving(false);

    if (!res.ok) {
      // The route returns creator-facing sentences for every 4xx (bad link,
      // duplicate, portfolio full), so show what it said rather than a generic
      // failure — "That post is already in your portfolio" is actionable.
      setError(res.error || 'Could not add this work. Check the link and try again.');
      return;
    }

    // Profile reads its portfolio through the same cache key.
    invalidateFetchCache('portfolio');
    invalidateFetchCache('profile-public');

    // Saved fine, but Instagram gave no picture — the item WILL show a plain
    // branded tile on the grid, and that reads as broken unless it's said out
    // loud here, once, right when it happens. See the note on platformHint
    // above for why this can't be fetched after the fact from this screen.
    if (res.data?.item?.platform === 'instagram' && !res.data.item.thumbnail_url) {
      Alert.alert(
        'Added — without a picture',
        "This post isn't among your dozen most recent on Instagram, so we don't have a cached picture for it. It'll show as a plain tile on your profile. Refreshing your numbers after posting keeps this from happening for new work.",
        [{ text: 'OK', onPress: () => router.back() }],
      );
      return;
    }

    router.back();
  }

  return (
    <Screen padded={false}>
      <ScreenScroll>
        <Card style={{ gap: t.spacing.lg }}>
          <Field
            label="Link to the post or video"
            placeholder="https://youtube.com/watch?v=…"
            value={url}
            onChangeText={(v) => {
              setUrl(v);
              if (error) setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            error={error}
            hint={hint ?? 'Paste the Instagram post, reel, or YouTube video you made.'}
          />

          <Field
            label="Title"
            placeholder="What was this piece of work?"
            value={title}
            onChangeText={setTitle}
            hint="Optional for YouTube — we’ll use the video’s own title."
          />

          <Field
            label="Brand"
            placeholder="Who was it for?"
            value={brand}
            onChangeText={setBrand}
            hint="Optional. Leave empty for your own content."
          />
        </Card>

        {/* Saying this here, before they save, is the honest version of the
            rule the grid enforces visually. */}
        <Card style={{ gap: t.spacing.sm, flexDirection: 'row', alignItems: 'flex-start' }}>
          <Info size={17} color={t.color.contentMuted} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="footnote" style={{ fontWeight: '600' }}>
              This shows as self-reported
            </Txt>
            <Txt variant="caption" tone="muted">
              Work you add yourself is labelled as your own claim. Projects you complete
              through Influnet carry the verified mark automatically — brands can tell the
              difference, which is what makes the mark worth having.
            </Txt>
          </View>
        </Card>

        <Card style={{ gap: t.spacing.sm, flexDirection: 'row', alignItems: 'flex-start' }}>
          <BadgeCheck size={17} color={t.color.verified} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt variant="footnote" style={{ fontWeight: '600' }}>
              Already added for you
            </Txt>
            <Txt variant="caption" tone="muted">
              Every collaboration you finish on Influnet appears in your portfolio on its
              own, with the brand and date taken from the project itself.
            </Txt>
          </View>
        </Card>

        {atCap && (
          <Card style={{ gap: 4, borderColor: t.color.warn }}>
            <Txt variant="footnote" style={{ fontWeight: '600', color: t.color.warn }}>
              Free portfolio is full ({portfolioLimit} items)
            </Txt>
            <Txt variant="caption" tone="muted">
              Remove one from your profile, or{isPro ? '' : ' upgrade to Pro to'} add more.
            </Txt>
          </Card>
        )}

        <Button
          label={saving ? 'Adding…' : atCap ? 'Portfolio full' : 'Add to portfolio'}
          onPress={save}
          disabled={!canSave}
        />
      </ScreenScroll>
    </Screen>
  );
}
