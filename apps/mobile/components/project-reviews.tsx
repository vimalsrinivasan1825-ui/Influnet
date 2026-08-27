/**
 * Ratings on a finished project.
 *
 * Web has had this on the project page since migration 051; the app never did,
 * so a brand who ran a collaboration from their phone could complete the work
 * and never rate the creator — and those ratings are exactly what now shows on
 * the creator's public profile. One review per person per project is enforced
 * by the database (051's UNIQUE constraint), so this screen's job is to show
 * what's already there and to offer the form only to someone who hasn't rated.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Star } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { Button, Card, Field, SectionLabel, Txt } from '@/components/ui';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  from_user?: { id: string; name: string | null; role: string | null } | null;
}

/** Five taps, no slider — a rating control should never need precision. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          accessibilityRole="radio"
          accessibilityState={{ selected: n === value }}
          accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
          hitSlop={6}
          onPress={() => onChange(n)}
        >
          <Star
            size={30}
            color={n <= value ? t.color.warn : t.color.contentMuted}
            fill={n <= value ? t.color.warn : 'transparent'}
          />
        </Pressable>
      ))}
    </View>
  );
}

/** A compact, single-line criteria picker — five small stars beside a label. */
function CriteriaPicker({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Txt variant="footnote" tone="soft">{label}</Txt>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} hitSlop={6} onPress={() => onChange(n)}>
            <Star size={18} color={n <= value ? t.color.warn : t.color.contentMuted} fill={n <= value ? t.color.warn : 'transparent'} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function StarRow({ rating, size = 13 }: { rating: number; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          color={n <= rating ? t.color.warn : t.color.contentMuted}
          fill={n <= rating ? t.color.warn : 'transparent'}
        />
      ))}
    </View>
  );
}

export function ProjectReviews({ projectId, partner }: { projectId: string; partner: string }) {
  const t = useTheme();
  const me = useSession((s) => s.profile?.id);

  const { data, refresh } = useFetch(
    () => endpoints.listReviews<{ reviews: Review[] }>(projectId),
    { cacheKey: `reviews:${projectId}` },
  );

  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState(5);
  const [communication, setCommunication] = useState(5);
  const [timeliness, setTimeliness] = useState(5);
  const [professionalism, setProfessionalism] = useState(5);

  const reviews = data?.reviews ?? [];
  const mine = reviews.find((r) => r.from_user?.id === me);

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await endpoints.createReview(projectId, {
      rating,
      comment: comment.trim() || null,
      quality_score: quality,
      communication_score: communication,
      timeliness_score: timeliness,
      professionalism_score: professionalism,
    });
    setSubmitting(false);
    if (!res.ok) {
      // The DB rejects a second review for the same project; surface that
      // rather than leaving the button looking broken.
      setError(res.error ?? 'Could not save your rating. Try again.');
      return;
    }
    setComment('');
    refresh();
  }

  return (
    <>
      <SectionLabel>Ratings</SectionLabel>

      {mine ? (
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt variant="bodyStrong">Your rating</Txt>
            <StarRow rating={mine.rating} />
          </View>
          {mine.comment ? (
            <Txt variant="footnote" tone="soft">
              {mine.comment}
            </Txt>
          ) : null}
          <Txt variant="caption" tone="muted">
            Ratings can't be changed once submitted.
          </Txt>
        </Card>
      ) : (
        <Card style={{ gap: t.spacing.md }}>
          <View style={{ gap: 4 }}>
            <Txt variant="bodyStrong">Rate {partner}</Txt>
            <Txt variant="footnote" tone="muted">
              Your rating appears on their public profile. It can't be edited afterwards.
            </Txt>
          </View>

          <StarPicker value={rating} onChange={setRating} />

          <View style={{ gap: t.spacing.sm }}>
            <CriteriaPicker label="Quality of work" value={quality} onChange={setQuality} />
            <CriteriaPicker label="Communication" value={communication} onChange={setCommunication} />
            <CriteriaPicker label="Timeliness" value={timeliness} onChange={setTimeliness} />
            <CriteriaPicker label="Professionalism" value={professionalism} onChange={setProfessionalism} />
          </View>

          <Field
            label="Comment (optional)"
            placeholder="How was the collaboration?"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={400}
          />

          {error ? (
            <Txt variant="footnote" style={{ color: t.color.danger }}>
              {error}
            </Txt>
          ) : null}

          <Button label="Submit rating" onPress={submit} loading={submitting} />
        </Card>
      )}

      {/* What the other side said, once they've said it. */}
      {reviews
        .filter((r) => r.from_user?.id !== me)
        .map((r) => (
          <Card key={r.id} style={{ gap: t.spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                {r.from_user?.name ?? partner}
              </Txt>
              <StarRow rating={r.rating} />
            </View>
            {r.comment ? (
              <Txt variant="footnote" tone="soft">
                {r.comment}
              </Txt>
            ) : null}
          </Card>
        ))}
    </>
  );
}
