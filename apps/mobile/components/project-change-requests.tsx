/**
 * Change requests on an active project.
 *
 * Terms agreed at the start of a project can be renegotiated through a change
 * request — one side proposes a change to the title, budget, advance, due date,
 * deliverables or description, and the other side accepts or rejects it.
 *
 * Web has had this since migration 063; the app never did, so a creator or
 * brand working from their phone had to open a browser to propose or respond
 * to a change. The API endpoints have existed all along — this is the UI that
 * calls them.
 *
 * Shows pending requests prominently with action buttons, then recent history
 * below. A "Propose change" button opens a sheet with the editable fields.
 */
import { useState } from 'react';
import { Pressable, View, ScrollView } from 'react-native';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { formatCurrency } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  Field,
  SectionLabel,
  Sheet,
  Txt,
  type SheetRef,
} from '@/components/ui';
import { Check, X, RotateCcw, Plus, History } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

interface ChangeRequest {
  id: string;
  proposed_by: string;
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  changes: Record<string, unknown>;
  before: Record<string, unknown> | null;
  review_note: string | null;
  reviewed_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Human-readable label for each changeable field. */
const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  deliverables: 'Deliverables',
  budget: 'Budget',
  advance_amount: 'Advance amount',
  due_date: 'Due date',
};

function formatFieldValue(key: string, val: unknown): string {
  if (val == null || val === '') return '—';
  if (key === 'budget' || key === 'advance_amount') {
    return formatCurrency(Number(val));
  }
  return String(val);
}

/** One row: what changed, in a sentence. */
function ChangeSummary({ changes }: { changes: Record<string, unknown> }) {
  const parts: string[] = [];
  if ('budget' in changes) parts.push(`Budget → ${formatCurrency(Number(changes.budget))}`);
  if ('advance_amount' in changes) parts.push(`Advance → ${formatCurrency(Number(changes.advance_amount))}`);
  if ('due_date' in changes) parts.push(`Due → ${changes.due_date}`);
  if ('title' in changes) parts.push(`Title → “${changes.title}”`);
  if ('deliverables' in changes) parts.push('Updated deliverables');
  if ('description' in changes) parts.push('Updated description');
  return parts.join(' · ');
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; tone: 'brand' | 'ok' | 'danger' | 'neutral' }> = {
    pending: { label: 'Pending', tone: 'brand' },
    accepted: { label: 'Accepted', tone: 'ok' },
    rejected: { label: 'Rejected', tone: 'danger' },
    withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  };
  const v = variants[status] ?? { label: status, tone: 'neutral' as const };
  return <Badge label={v.label} tone={v.tone} />;
}

/**
 * Form state for a new change request.
 * Mirrors the editable fields in the API schema (EDITABLE_FIELDS).
 */
interface ChangeForm {
  title: string;
  description: string;
  deliverables: string;
  budget: string;
  advance_amount: string;
  due_date: string;
}

const EMPTY_FORM: ChangeForm = {
  title: '',
  description: '',
  deliverables: '',
  budget: '',
  advance_amount: '',
  due_date: '',
};

export function ProjectChangeRequests({
  projectId,
  project,
  partner,
}: {
  projectId: string;
  project: {
    title: string;
    description: string | null;
    deliverables: string | null;
    budget: number | null;
    advance_amount: number | null;
  };
  partner: string;
}) {
  const t = useTheme();
  const me = useSession((s) => s.profile?.id);

  const { data, refresh } = useFetch(
    () => endpoints.listChangeRequests<{ change_requests: ChangeRequest[] }>(projectId),
    { cacheKey: `change-requests:${projectId}` },
  );

  const [proposeSheet, setProposeSheet] = useState<SheetRef | null>(null);
  const [form, setForm] = useState<ChangeForm>(EMPTY_FORM);
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const crs = data?.change_requests ?? [];

  /** Propose a change with the form fields that differ from current values. */
  async function proposeChange() {
    setProposeError(null);
    const changes: Record<string, unknown> = {};
    if (form.title && form.title !== project.title) changes.title = form.title.trim();
    if (form.description && form.description !== (project.description ?? '')) {
      changes.description = form.description.trim();
    }
    if (form.deliverables && form.deliverables !== (project.deliverables ?? '')) {
      changes.deliverables = form.deliverables.trim();
    }
    const budgetNum = Number(form.budget.replace(/[^0-9]/g, ''));
    if (budgetNum > 0 && budgetNum !== Number(project.budget)) changes.budget = budgetNum;
    const advanceNum = Number(form.advance_amount.replace(/[^0-9]/g, ''));
    if (advanceNum > 0 && advanceNum !== Number(project.advance_amount)) {
      changes.advance_amount = advanceNum;
    }
    if (form.due_date && form.due_date !== '') changes.due_date = form.due_date.trim();

    if (Object.keys(changes).length === 0) {
      setProposeError('Change at least one field to propose a change.');
      return;
    }

    setProposing(true);
    const res = await endpoints.createChangeRequest(projectId, { changes });
    setProposing(false);
    if (!res.ok) {
      setProposeError(res.error ?? 'Could not create change request.');
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setForm(EMPTY_FORM);
    proposeSheet?.close();
    refresh();
  }

  async function respond(requestId: string, action: 'accept' | 'reject' | 'withdraw') {
    setActingOn(requestId);
    const res = await endpoints.respondToChangeRequest(projectId, {
      request_id: requestId,
      action,
    });
    setActingOn(null);
    if (res.ok) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      refresh();
    }
  }

  const pendings = crs.filter((cr) => cr.status === 'pending');
  const history = crs.filter((cr) => cr.status !== 'pending');

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Change requests</SectionLabel>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Propose a change"
          onPress={() => proposeSheet?.expand()}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
        >
          <Plus size={14} color={t.color.brand} />
          <Txt variant="footnote" tone="brand">
            Propose change
          </Txt>
        </Pressable>
      </View>

      {/* Pending requests — these need action */}
      {pendings.map((cr) => {
        const isProposer = cr.proposed_by === me;
        const canAct = isProposer ? true : true; // proposer can withdraw, other can accept/reject

        return (
          <Card
            key={cr.id}
            style={{ gap: t.spacing.sm, borderColor: t.color.brand + '40' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.sm }}>
              <RotateCcw size={15} color={t.color.brand} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, flexWrap: 'wrap' }}>
                  <Txt variant="footnote" style={{ fontWeight: '600', flex: 1 }}>
                    {isProposer ? 'You' : partner} proposed a change
                  </Txt>
                  <StatusBadge status="pending" />
                </View>
                <Txt variant="caption" tone="soft">
                  {ChangeSummary({ changes: cr.changes })}
                </Txt>
              </View>
            </View>

            {/* Detailed diff */}
            <View style={{ gap: t.spacing.xs }}>
              {Object.entries(cr.changes as Record<string, unknown>).map(([key, val]) => {
                const before = (cr.before as Record<string, unknown> | null)?.[key];
                return (
                  <View
                    key={key}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: t.spacing.xs,
                      borderBottomWidth: 1,
                      borderBottomColor: t.color.hairline,
                    }}
                  >
                    <Txt variant="caption" tone="muted" style={{ flex: 1 }}>
                      {FIELD_LABELS[key] ?? key}
                    </Txt>
                    <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                      {before != null && before !== val ? (
                        <Txt
                          variant="caption"
                          tone="danger"
                          style={{ textDecorationLine: 'line-through' }}
                        >
                          {formatFieldValue(key, before)}
                        </Txt>
                      ) : null}
                      <Txt variant="caption" tone="ok">
                        {formatFieldValue(key, val)}
                      </Txt>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
              {isProposer ? (
                <Button
                  label="Withdraw"
                  variant="secondary"
                  size="md"
                  inline
                  disabled={actingOn === cr.id}
                  loading={actingOn === cr.id}
                  onPress={() => respond(cr.id, 'withdraw')}
                />
              ) : (
                <>
                  <Button
                    label="Reject"
                    variant="secondary"
                    size="md"
                    inline
                    disabled={actingOn === cr.id}
                    icon={<X size={14} color={t.color.content} />}
                    onPress={() => respond(cr.id, 'reject')}
                  />
                  <Button
                    label="Accept"
                    variant="primary"
                    size="md"
                    inline
                    disabled={actingOn === cr.id}
                    loading={actingOn === cr.id}
                    icon={<Check size={14} color={t.color.white} />}
                    onPress={() => respond(cr.id, 'accept')}
                  />
                </>
              )}
            </View>
          </Card>
        );
      })}

      {/* Resolved history */}
      {history.length > 0 ? (
        <Card style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <History size={14} color={t.color.contentMuted} />
            <Txt variant="caption" tone="muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              History
            </Txt>
          </View>
          {history.map((cr) => {
            const isProposer = cr.proposed_by === me;
            return (
              <View
                key={cr.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: t.spacing.sm,
                  paddingVertical: t.spacing.sm,
                  borderTopWidth: 1,
                  borderTopColor: t.color.hairline,
                }}
              >
                <StatusBadge status={cr.status} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="footnote" tone="soft">
                    {isProposer ? 'You' : partner}: {ChangeSummary({ changes: cr.changes })}
                  </Txt>
                  {cr.review_note ? (
                    <Txt variant="caption" tone="muted">
                      “{cr.review_note}”
                    </Txt>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      {/* Propose change sheet */}
      <Sheet
        ref={(r) => setProposeSheet(r)}
        title="Propose a change"
        snapPoints={['75%']}
      >
        <Txt variant="footnote" tone="muted">
          Changes need the other side to accept. You can withdraw a pending proposal
          at any time — no negotiation happens here, just the vote.
        </Txt>

        <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ gap: t.spacing.md }}>
          <Field
            label="Title"
            placeholder={project.title}
            value={form.title}
            onChangeText={(v) => { setForm((f) => ({ ...f, title: v })); if (proposeError) setProposeError(null); }}
          />

          <Field
            label="Description"
            placeholder={project.description ?? 'Current: not set'}
            value={form.description}
            onChangeText={(v) => { setForm((f) => ({ ...f, description: v })); if (proposeError) setProposeError(null); }}
            multiline
          />

          <Field
            label="Deliverables"
            placeholder={project.deliverables ?? 'Current: not set'}
            value={form.deliverables}
            onChangeText={(v) => { setForm((f) => ({ ...f, deliverables: v })); if (proposeError) setProposeError(null); }}
            multiline
          />

          <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field
                label="Budget (₹)"
                placeholder={project.budget ? String(project.budget) : 'Current'}
                value={form.budget}
                onChangeText={(v) => { setForm((f) => ({ ...f, budget: v })); if (proposeError) setProposeError(null); }}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Advance (₹)"
                placeholder={project.advance_amount ? String(project.advance_amount) : 'Current'}
                value={form.advance_amount}
                onChangeText={(v) => { setForm((f) => ({ ...f, advance_amount: v })); if (proposeError) setProposeError(null); }}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <Field
            label="Due date"
            placeholder="YYYY-MM-DD"
            value={form.due_date}
            onChangeText={(v) => { setForm((f) => ({ ...f, due_date: v })); if (proposeError) setProposeError(null); }}
            hint="Leave blank to keep the current due date"
          />
        </ScrollView>

        {proposeError ? (
          <Card style={{ backgroundColor: t.color.dangerSoft, borderColor: t.color.danger }}>
            <Txt variant="caption" tone="danger">
              {proposeError}
            </Txt>
          </Card>
        ) : null}

        <Button
          label="Send for review"
          onPress={proposeChange}
          loading={proposing}
          disabled={Object.values(form).every((v) => !v)}
        />
      </Sheet>
    </>
  );
}
