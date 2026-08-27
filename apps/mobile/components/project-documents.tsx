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
import { View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { FileText } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { endpoints } from '@/lib/api';
import { useFetch } from '@/lib/use-fetch';
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
  const [issuing, setIssuing] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const documents = data?.documents ?? [];

  async function issueProforma() {
    setIssuing(true);
    await endpoints.issueProjectDocument(projectId, 'proforma');
    setIssuing(false);
    refresh();
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
        <Button
          variant="secondary"
          size="md"
          label="Issue proforma"
          icon={<FileText size={14} color={t.color.content} />}
          loading={issuing}
          onPress={issueProforma}
          inline
        />
      </View>

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
