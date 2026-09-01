/**
 * Edit profile — mobile parity with the web dashboard's Settings page
 * ("Profile information" + the role-specific section below it). Business
 * owners had no way to edit their profile from the app at all; this closes
 * that gap. Same fields web exposes here, no more — pricing/media-kit
 * fields live only in web's fuller settings page.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { sanitizePhoneInput } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { uploadImage } from '@/lib/upload';
import { invalidateFetchCache } from '@/lib/use-fetch';
import { Avatar, Button, Card, ErrorState, Field, ScreenScroll, SectionLabel, SkeletonCard, Txt } from '@/components/ui';
import { CityField } from '@/components/city-field';

interface ProfileResponse {
  role: string;
  name: string;
  phone: string | null;
  location: string | null;
  username?: string | null;
  avatar_url?: string | null;
  logo_url?: string | null;
  company_name?: string | null;
  industry?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  bio?: string | null;
  headline?: string | null;
  instagram_handle?: string | null;
  youtube_handle?: string | null;
  creating_since?: number | null;
  gst_number?: string | null;
}

export default function EditProfileScreen() {
  const t = useTheme();
  const router = useRouter();
  const { loadProfile } = useSession();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // business
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // creator
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [youtube, setYoutube] = useState('');
  const [creatingSince, setCreatingSince] = useState('');
  const [gstNumber, setGstNumber] = useState('');

  useEffect(() => {
    (async () => {
      const res = await endpoints.getProfile<{ profile: ProfileResponse }>();
      if (!res.ok || !res.data) {
        setLoadError(res.error ?? 'Could not load your profile.');
        setLoading(false);
        return;
      }
      const p = res.data.profile;
      setRole(p.role);
      setName(p.name ?? '');
      setPhone(p.phone ?? '');
      setLocation(p.location ?? '');
      setUsername(p.username ?? '');
      setAvatarUrl((p.role === 'business_owner' ? p.logo_url : p.avatar_url) ?? '');
      setCompanyName(p.company_name ?? '');
      setIndustry(p.industry ?? '');
      setContactName(p.contact_name ?? '');
      setContactPhone(p.contact_phone ?? '');
      setContactEmail(p.contact_email ?? '');
      setCity('');
      setHeadline(p.headline ?? '');
      setBio(p.bio ?? '');
      setInstagram(p.instagram_handle ?? '');
      setYoutube(p.youtube_handle ?? '');
      setCreatingSince(p.creating_since != null ? String(p.creating_since) : '');
      setGstNumber(p.gst_number ?? '');
      setLoading(false);
    })();
  }, []);

  const isBusiness = role === 'business_owner';
  const isCreator = role === 'influencer';

  async function changeAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo library access in Settings to change your picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setAvatarBusy(true);
    try {
      const { url } = await uploadImage(
        { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType },
        'profile',
      );
      setAvatarUrl(url);
    } catch (err) {
      Alert.alert('Upload failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      location: location.trim() || undefined,
    };
    if (isBusiness) {
      payload.company_name = companyName.trim();
      payload.industry = industry.trim() || undefined;
      payload.contact_name = contactName.trim();
      payload.contact_phone = contactPhone.trim();
      payload.contact_email = contactEmail.trim();
      if (city.trim()) payload.city = city.trim();
      if (avatarUrl) payload.logo_url = avatarUrl;
      if (username.trim()) payload.username = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    } else if (isCreator) {
      payload.headline = headline.trim() || undefined;
      payload.bio = bio.trim() || undefined;
      payload.instagram_handle = instagram.trim() || undefined;
      payload.youtube_handle = youtube.trim() || undefined;
      // Same range web's settings page validates — not before creators
      // realistically existed on the platform, not in the future.
      if (creatingSince.trim()) {
        const yr = Number(creatingSince);
        if (Number.isInteger(yr) && yr >= 1990 && yr <= new Date().getFullYear()) {
          payload.creating_since = yr;
        }
      }
      // Optional — most creators are not GST-registered; the server validates
      // the format when one is provided.
      payload.gst_number = gstNumber.trim().toUpperCase();
      if (avatarUrl) payload.avatar_url = avatarUrl;
      if (username.trim()) payload.username = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    }

    const res = await endpoints.updateProfile(payload);
    setSaving(false);

    if (!res.ok) {
      Alert.alert('Could not save', res.error ?? 'Please try again.');
      return;
    }

    invalidateFetchCache('profile-public');
    invalidateFetchCache('profile-full');
    await loadProfile();
    router.back();
  }

  if (loading) {
    return (
      <ScreenScroll>
        <SkeletonCard />
      </ScreenScroll>
    );
  }

  if (loadError) {
    return (
      <ScreenScroll>
        <ErrorState message={loadError} onRetry={() => router.replace('/edit-profile')} />
      </ScreenScroll>
    );
  }

  return (
    <ScreenScroll contentContainerStyle={{ paddingTop: t.spacing.lg, gap: t.spacing.lg }}>
      <SectionLabel>Profile information</SectionLabel>
      <Card style={{ gap: t.spacing.lg, alignItems: 'center' }}>
        <Pressable
          onPress={changeAvatar}
          disabled={avatarBusy}
          accessibilityRole="button"
          accessibilityLabel={isBusiness ? 'Change logo' : 'Change profile picture'}
          style={{ position: 'relative' }}
        >
          <Avatar uri={avatarUrl || undefined} name={isBusiness ? companyName || name : name} size={72} />
          <View
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: t.color.brand,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: t.color.surfaceCard,
            }}
          >
            {avatarBusy ? (
              <ActivityIndicator size="small" color={t.color.white} />
            ) : (
              <Camera size={12} color={t.color.white} />
            )}
          </View>
        </Pressable>

        <View style={{ width: '100%', gap: t.spacing.md }}>
          <Field label="Full name" value={name} onChangeText={setName} placeholder="Your name" />
          <Field
            label="Phone"
            value={phone}
            onChangeText={(v) => setPhone(sanitizePhoneInput(v).slice(0, 20))}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            maxLength={64}
          />
          <Field label="Location" value={location} onChangeText={setLocation} placeholder="City, Country" />
        </View>
      </Card>

      {isBusiness ? (
        <>
          <SectionLabel>Business details</SectionLabel>
          <Card style={{ gap: t.spacing.md }}>
            <Field
              label="Platform username"
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="yourusername"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field label="Company name" value={companyName} onChangeText={setCompanyName} placeholder="Your company" />
            <Field label="Industry" value={industry} onChangeText={setIndustry} placeholder="e.g. Fashion, Tech, Food" />
            <CityField label="City" value={city} onChangeText={setCity} placeholder="Your city" />
          </Card>

          <SectionLabel>Contact details</SectionLabel>
          <Card style={{ gap: t.spacing.md }}>
            <Txt variant="caption" tone="muted">
              Shown to a creator only after they choose to reveal it (or on Pro) —
              never on your public profile.
            </Txt>
            <Field label="Contact person" value={contactName} onChangeText={setContactName} placeholder="Who creators should reach" />
            <Field label="Phone" value={contactPhone} onChangeText={setContactPhone} placeholder="+91…" keyboardType="phone-pad" />
            <Field label="Email" value={contactEmail} onChangeText={setContactEmail} placeholder="you@company.com" autoCapitalize="none" keyboardType="email-address" />
          </Card>
        </>
      ) : null}

      {isCreator ? (
        <>
          <SectionLabel>Creator profile</SectionLabel>
          <Card style={{ gap: t.spacing.md }}>
            <Field
              label="Platform username"
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
              placeholder="yourusername"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Field label="Headline" value={headline} onChangeText={setHeadline} placeholder="e.g. Fitness creator · 50K followers" />
            <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Tell brands about yourself…" multiline />
            <Field label="Instagram handle" value={instagram} onChangeText={setInstagram} placeholder="@username" autoCapitalize="none" />
            <Field label="YouTube channel" value={youtube} onChangeText={setYoutube} placeholder="@channel" autoCapitalize="none" />
            <Field
              label="Creating since (year)"
              value={creatingSince}
              onChangeText={(v) => setCreatingSince(v.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="e.g. 2019"
              keyboardType="number-pad"
            />
            <Field
              label="GST number (optional)"
              value={gstNumber}
              onChangeText={(v) => setGstNumber(v.toUpperCase().slice(0, 15))}
              placeholder="e.g. 22AAAAA0000A1Z5"
              autoCapitalize="characters"
            />
          </Card>
        </>
      ) : null}

      <Button label={saving ? 'Saving…' : 'Save changes'} onPress={save} loading={saving} disabled={saving} />
      <Txt variant="caption" tone="muted" center>
        Email can&apos;t be changed here.
      </Txt>
    </ScreenScroll>
  );
}
