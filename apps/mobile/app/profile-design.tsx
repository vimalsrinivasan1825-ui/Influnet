/**
 * Customize public profile — the app's twin of the web page's "Customize" panel.
 *
 * The public profile only has one renderer, the web page, so the preview on top
 * IS that page in a WebView. Unpublished choices reach it as `?design=…`
 * (designs only — see applyProfileDesignParam in packages/core), which is why
 * the closing note shows up in the preview only once it is published.
 *
 * Publishing goes through the same PUT /api/profile/layout the web panel uses,
 * which sanitises the layout; featured posts and the hero post are carried over
 * untouched from what is already published, since they are picked on the web.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import {
  DEFAULT_PROFILE_LAYOUT_SECTIONS,
  MAX_CLOSING_NOTE,
  PROFILE_LAYOUT_LABELS,
  PROFILE_LAYOUT_ORDER,
  PROFILE_LAYOUT_VARIANTS,
  profileDesignParam,
  type ProfileLayoutSection,
  type ResolvedProfileLayout,
} from "@influnet/core";
import { useTheme } from "@/lib/theme";
import { endpoints } from "@/lib/api";
import { ProfileWebView } from "@/components/profile-web-view";
import {
  Button,
  Chip,
  ChipRail,
  ChipWrap,
  ErrorState,
  Field,
  Screen,
  SkeletonCard,
  Txt,
} from "@/components/ui";

type LayoutResponse = {
  layout: ResolvedProfileLayout;
  username: string | null;
};

export default function ProfileDesignScreen() {
  const t = useTheme();
  const router = useRouter();
  const [published, setPublished] = useState<ResolvedProfileLayout | null>(
    null,
  );
  const [draft, setDraft] = useState<ResolvedProfileLayout | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [section, setSection] = useState<ProfileLayoutSection>("hero");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setFailed(false);
    const res = await endpoints.profileLayout<LayoutResponse>();
    if (!res.ok || !res.data?.layout) {
      setFailed(true);
      return;
    }
    setPublished(res.data.layout);
    setDraft(res.data.layout);
    setUsername(res.data.username);
  }

  useEffect(() => {
    void load();
  }, []);

  const dirty = useMemo(() => {
    if (!draft || !published) return false;
    return (
      PROFILE_LAYOUT_ORDER.some(
        (s) => draft.sections[s] !== published.sections[s],
      ) || (draft.closingNote ?? "") !== (published.closingNote ?? "")
    );
  }, [draft, published]);

  async function publish() {
    if (!draft) return;
    setSaving(true);
    const res = await endpoints.publishProfileLayout<{
      layout: ResolvedProfileLayout;
    }>({
      sections: draft.sections,
      featured: draft.featured,
      heroPost: draft.heroPost,
      closingNote: draft.closingNote?.trim() || null,
    });
    setSaving(false);
    if (!res.ok || !res.data?.layout) {
      Alert.alert("Could not publish", res.error ?? "Please try again.");
      return;
    }
    setPublished(res.data.layout);
    setDraft(res.data.layout);
    Alert.alert(
      "Published",
      "Brands now see this design on your public profile.",
    );
  }

  function discard() {
    if (published) setDraft(published);
  }

  if (failed) {
    return (
      <Screen>
        <ErrorState
          message="Couldn't load your profile design."
          onRetry={load}
        />
      </Screen>
    );
  }
  if (!draft || !published) {
    return (
      <Screen>
        <SkeletonCard />
        <SkeletonCard />
      </Screen>
    );
  }

  const variants = PROFILE_LAYOUT_VARIANTS[section] as readonly string[];
  const labels = PROFILE_LAYOUT_LABELS[section].variants as Record<
    string,
    string
  >;
  const current = draft.sections[section] as string;
  const isDefault = (v: string) =>
    (DEFAULT_PROFILE_LAYOUT_SECTIONS[section] as string) === v;

  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: "Customize profile" }} />

      <View
        style={{
          flex: 1,
          borderBottomWidth: 1,
          borderBottomColor: t.color.hairline,
        }}
      >
        {username ? (
          <ProfileWebView
            username={username}
            query={`design=${profileDesignParam(draft.sections)}`}
            bare
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              padding: t.spacing.xl,
            }}
          >
            <Txt variant="footnote" tone="muted" center>
              Set a username in Edit profile to get a public page.
            </Txt>
          </View>
        )}
      </View>

      <View
        style={{
          gap: t.spacing.md,
          paddingVertical: t.spacing.md,
          backgroundColor: t.color.surfaceCard,
        }}
      >
        <ChipRail>
          {PROFILE_LAYOUT_ORDER.map((s) => (
            <Chip
              key={s}
              label={PROFILE_LAYOUT_LABELS[s].title}
              selected={s === section}
              onPress={() => setSection(s)}
            />
          ))}
        </ChipRail>

        <View
          style={{ paddingHorizontal: t.spacing.screen, gap: t.spacing.sm }}
        >
          <Txt variant="footnote" tone="muted">
            Design for {PROFILE_LAYOUT_LABELS[section].title.toLowerCase()}
          </Txt>
          <ChipWrap>
            {variants.map((v) => (
              <Chip
                key={v}
                label={isDefault(v) ? `${labels[v]} · default` : labels[v]}
                selected={v === current}
                onPress={() =>
                  setDraft({
                    ...draft,
                    sections: { ...draft.sections, [section]: v },
                  })
                }
              />
            ))}
          </ChipWrap>

          {section === "closer" ? (
            <Field
              label="Your closing note"
              hint={`Shows in the preview after you publish · ${(draft.closingNote ?? "").length}/${MAX_CLOSING_NOTE}`}
              value={draft.closingNote ?? ""}
              maxLength={MAX_CLOSING_NOTE}
              placeholder="A line brands read before they reach out"
              onChangeText={(text: string) =>
                setDraft({ ...draft, closingNote: text })
              }
            />
          ) : null}

          <Txt variant="footnote" tone="muted">
            Pick featured posts and the opening post on the web page for now.
          </Txt>

          <View style={{ flexDirection: "row", gap: t.spacing.sm }}>
            <Button
              label="Discard"
              size="md"
              variant="secondary"
              disabled={!dirty || saving}
              onPress={discard}
              style={{ flex: 1 }}
            />
            <Button
              label={dirty ? "Publish" : "Published"}
              size="md"
              loading={saving}
              disabled={!dirty}
              onPress={publish}
              style={{ flex: 1 }}
            />
          </View>
          {!dirty && username ? (
            <Button
              label="View my public profile"
              size="md"
              variant="ghost"
              onPress={() =>
                router.push({
                  pathname: "/creator/[username]",
                  params: { username },
                })
              }
            />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
