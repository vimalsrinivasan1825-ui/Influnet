/**
 * B3 — documents on a project, mobile side.
 *
 * The PDF route needs an Authorization header, which the system browser
 * `Linking.openURL()` opens can't attach and a bare `Linking.openURL()` would
 * otherwise require putting the real session token in a URL — a bearer
 * credential leaking into browser history. Instead this asks the server for a
 * short-lived, single-document signed link (download-token.ts) and opens
 * THAT — good for one document, for ten minutes, and useless afterwards.
 */
import { useState } from 'react';
import { Alert, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { FileText } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
import { useEntitlements } from '@/lib/use-entitlements';
import { Button, Card, ListRow, SectionLabel, Txt } from '@/components/ui';

interface ProjectDocument {
  id: string;
  kind: 'receipt' | 'proforma' | 'tax_invoice';
  number: string;
  issued_at: string;
  cancelled_at?: string | null;
}

export function ProjectDocuments({ projectId }: { projectId: string }) {
  const t = useTheme();
  const { data, refresh } = useFetch(
    () => endpoints.listProjectDocuments<{ documents: ProjectDocument[] }>(projectId),
    { cacheKey: `documents:${projectId}` },
  );
  const [issuingKind, setIssuingKind] = useState<'proforma' | 'tax_invoice' | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const { entitlements, refresh: refreshEnt } = useEntitlements();

  const documents = data?.documents ?? [];

  const invoiceLimit =
    entitlements?.subscriptionsEnabled && typeof entitlements.limits.invoicesPerMonth === 'number'
      ? entitlements.limits.invoicesPerMonth
      : null;
  const invoicesUsed = entitlements?.usage.invoicesThisMonth ?? 0;
  const atCap = invoiceLimit !== null && invoicesUsed >= invoiceLimit;

  async function issue(kind: 'proforma' | 'tax_invoice') {
    setIssuingKind(kind);
    const res = await endpoints.issueProjectDocument(projectId, kind);
    setIssuingKind(null);
    if (!res.ok) {
      Alert.alert(
        res.status === 402 ? 'Invoice limit reached' : 'Could not issue document',
        res.error ?? 'Please try again.',
      );
      return;
    }
    refresh();
    refreshEnt();
  }

  async function view(doc: ProjectDocument) {
    setOpeningId(doc.id);
    const res = await endpoints.getDocumentDownloadLink<{ url: string }>(projectId, doc.id);
    setOpeningId(null);
    if (res.ok && res.data?.url) {
      await WebBrowser.openBrowserAsync(res.data.url);
    }
  }

  return (
    <View style={{ gap: t.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionLabel>Documents</SectionLabel>
        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <Button
            variant="secondary"
            size="md"
            label="Proforma"
            icon={<FileText size={14} color={t.color.content} />}
            loading={issuingKind === 'proforma'}
            onPress={() => issue('proforma')}
            disabled={atCap}
            inline
          />
          <Button
            variant="secondary"
            size="md"
            label="Tax invoice"
            icon={<FileText size={14} color={t.color.content} />}
            loading={issuingKind === 'tax_invoice'}
            onPress={() => issue('tax_invoice')}
            disabled={atCap}
            inline
          />
        </View>
      </View>

      {invoiceLimit !== null && (
        <Txt variant="caption" tone={atCap ? 'warn' : 'muted'}>
          {invoicesUsed} of {invoiceLimit} invoices this month
          {atCap ? ' · upgrade to Pro for unlimited' : ''}
        </Txt>
      )}

      {documents.length === 0 ? (
        <Card>
          <Txt variant="footnote" tone="muted">No documents issued yet.</Txt>
        </Card>
      ) : (
        documents.map((doc) => (
          <ListRow
            key={doc.id}
            title={doc.number}
            subtitle={`${doc.kind}${doc.cancelled_at ? ' · cancelled' : ''} · ${new Date(doc.issued_at).toLocaleDateString('en-IN')}`}
            onPress={() => view(doc)}
            right={openingId === doc.id ? undefined : <FileText size={16} color={t.color.contentMuted} />}
          />
        ))
      )}
    </View>
  );
}
