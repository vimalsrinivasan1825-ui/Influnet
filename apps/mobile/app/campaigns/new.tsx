/**
 * New campaign — mobile parity with web's /dashboard/campaigns/new.
 *
 * Was entirely missing: a business owner could browse and manage campaigns
 * from the app but had no way to create one, so publishing a campaign was a
 * web-only action. Same fields, same validation as web (a brief needs 50
 * characters of description or deliverables, and at least one platform,
 * before it can go live — enforced server-side either way).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { endpoints } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { Button, Card, ChipWrap, Chip, Field, ScreenScroll, Txt } from '@/components/ui';

const CATEGORIES = ['fashion', 'beauty', 'tech', 'food', 'travel', 'fitness', 'lifestyle', 'gaming'];
const PLATFORMS = ['instagram', 'youtube', 'facebook', 'twitter', 'snapchat'];
const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook', twitter: 'X', snapchat: 'Snapchat',
};

export default function NewCampaignScreen() {
  const t = useTheme();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliverables, setDeliverables] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [followerMin, setFollowerMin] = useState('');
  const [location, setLocation] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function submit() {
    setError(null);
    if (!title.trim()) return setError('Give your campaign a title.');
    if (description.trim().length < 50 && deliverables.trim().length < 50) {
      return setError('Add at least 50 characters of description or deliverables.');
    }
    if (platforms.length === 0) return setError('Pick at least one platform.');

    setSaving(true);
    const res = await endpoints.createCampaign<{ campaign: { id: string } }>({
      title: title.trim(),
      description: description.trim(),
      deliverables: deliverables.trim(),
      budget_min: budgetMin ? Number(budgetMin) : undefined,
      budget_max: budgetMax ? Number(budgetMax) : undefined,
      follower_min: followerMin ? Number(followerMin) : undefined,
      location: location.trim() || undefined,
      categories,
      platforms,
    });
    setSaving(false);
    if (res.ok && res.data?.campaign?.id) {
      router.replace(`/campaigns/${res.data.campaign.id}` as any);
    } else {
      setError(res.error ?? 'Could not create the campaign.');
    }
  }

  return (
    <ScreenScroll>
      <View style={{ gap: t.spacing.lg }}>
        <View style={{ gap: 2 }}>
          <Txt variant="title2">New campaign</Txt>
          <Txt variant="footnote" tone="muted">Describe what you need and find the right creator.</Txt>
        </View>

        <Card style={{ gap: t.spacing.md }}>
          <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Summer collection launch" />
          <Field label="Description" value={description} onChangeText={setDescription} placeholder="What is this campaign about?" multiline />
          <Field label="Deliverables" value={deliverables} onChangeText={setDeliverables} placeholder="What do you expect from the creator?" multiline />
          <Field label="Budget min (₹)" value={budgetMin} onChangeText={(v) => setBudgetMin(v.replace(/[^0-9]/g, ''))} placeholder="5000" keyboardType="number-pad" />
          <Field label="Budget max (₹)" value={budgetMax} onChangeText={(v) => setBudgetMax(v.replace(/[^0-9]/g, ''))} placeholder="25000" keyboardType="number-pad" />
          <Field label="Min followers" value={followerMin} onChangeText={(v) => setFollowerMin(v.replace(/[^0-9]/g, ''))} placeholder="10000" keyboardType="number-pad" />
          <Field label="Location" value={location} onChangeText={setLocation} placeholder="Mumbai" />

          <View style={{ gap: 6 }}>
            <Txt variant="footnote" tone="soft">Platforms *</Txt>
            <ChipWrap>
              {PLATFORMS.map((p) => (
                <Chip key={p} label={PLATFORM_LABEL[p]} selected={platforms.includes(p)} onPress={() => toggle(platforms, setPlatforms, p)} />
              ))}
            </ChipWrap>
          </View>

          <View style={{ gap: 6 }}>
            <Txt variant="footnote" tone="soft">Categories</Txt>
            <ChipWrap>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={categories.includes(c)} onPress={() => toggle(categories, setCategories, c)} />
              ))}
            </ChipWrap>
          </View>

          {error ? <Txt variant="footnote" style={{ color: t.color.danger }}>{error}</Txt> : null}

          <Button label="Create campaign" onPress={submit} loading={saving} />
        </Card>
      </View>
    </ScreenScroll>
  );
}
