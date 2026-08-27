/**
 * Receipt / proforma PDF template using @react-pdf/renderer.
 *
 * Renders from a frozen snapshot — never re-reads live data. The snapshot
 * is captured at issue time and stored in project_documents.snapshot.
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 10, color: '#64748b' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { color: '#64748b', width: '40%' },
  value: { fontWeight: 'bold', width: '60%', textAlign: 'right' },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', color: '#64748b' },
  total: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', fontSize: 14, fontWeight: 'bold' },
  watermark: { position: 'absolute', top: '40%', left: '20%', fontSize: 40, color: '#fca5a5', transform: 'rotate(-45deg)', opacity: 0.3 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#94a3b8', textAlign: 'center' },
});

/**
 * B4 — tax invoices. The supplier is the CREATOR, not Influnet: nothing in
 * this codebase's payment flow deducts a platform fee (the Razorpay order
 * amount is always the full agreed budget), so Influnet is never a financial
 * party to the transaction — it is the venue, not the seller. That is the
 * model this template assumes.
 *
 * A creator without a GST number is, under Indian GST law, not permitted to
 * charge GST at all — the correct document for them is a Bill of Supply, not
 * a Tax Invoice with a tax breakup. `kind: 'tax_invoice'` covers both; which
 * one renders is decided by whether the snapshot carries a supplier GSTIN,
 * not by a separate document type, since the DB's CHECK constraint on
 * project_documents.kind only knows about three values and a reader's actual
 * question — "is this a valid tax document?" — depends on the GSTIN either way.
 *
 * The GST split shown is a single combined line, not itemised CGST/SGST vs
 * IGST — that split depends on whether supplier and recipient are in the same
 * state, and creator profiles do not currently carry a state field to
 * determine that correctly. Showing a fabricated split would be worse than
 * showing an honest single line and saying so.
 */
export interface GstParty {
  name: string;
  gstin?: string | null;
  address?: string | null;
  state?: string | null;
}

export interface ReceiptSnapshot {
  kind: 'proforma' | 'receipt' | 'tax_invoice';
  number: string;
  project: { title: string; description?: string };
  parties: { issuer: string; recipient: string };
  deliverables?: string;
  amountPaise: number;
  currency: string;
  payments: Array<{ stage: string; amountPaise: number; status: string; paidAt?: string }>;
  issuedAt: string;
  /** Only present when kind === 'tax_invoice'. */
  tax?: {
    /** True when the supplier has no GST number — legally a Bill of Supply, not a Tax Invoice. */
    isBillOfSupply: boolean;
    supplier: GstParty;
    recipient: GstParty;
    ratePercent: number;
    taxableAmountPaise: number;
    taxAmountPaise: number;
  };
}

export function ReceiptDocument({ snapshot }: { snapshot: ReceiptSnapshot }) {
  const totalRupees = (snapshot.amountPaise / 100).toLocaleString('en-IN');
  const isProforma = snapshot.kind === 'proforma';
  const isTax = snapshot.kind === 'tax_invoice';
  const hasPaid = snapshot.payments.some((p) => p.status === 'paid');
  const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

  const docTitle = isTax
    ? snapshot.tax?.isBillOfSupply ? 'Bill of Supply' : 'Tax Invoice'
    : isProforma ? 'Proforma Invoice' : 'Receipt';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {isProforma && !hasPaid && <Text style={styles.watermark}>NOT A RECEIPT</Text>}

        <View style={styles.header}>
          <Text style={styles.title}>{docTitle}</Text>
          <Text style={styles.subtitle}>#{snapshot.number}</Text>
        </View>

        {isTax && snapshot.tax ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Supplier</Text>
              <Text>{snapshot.tax.supplier.name}</Text>
              {snapshot.tax.supplier.gstin ? <Text>GSTIN: {snapshot.tax.supplier.gstin}</Text> : null}
              {snapshot.tax.supplier.address ? <Text>{snapshot.tax.supplier.address}</Text> : null}
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recipient</Text>
              <Text>{snapshot.tax.recipient.name}</Text>
              {snapshot.tax.recipient.gstin ? <Text>GSTIN: {snapshot.tax.recipient.gstin}</Text> : null}
              {snapshot.tax.recipient.address ? <Text>{snapshot.tax.recipient.address}</Text> : null}
            </View>
          </>
        ) : (
          <>
            <View style={styles.row}>
              <Text style={styles.label}>From</Text>
              <Text style={styles.value}>{snapshot.parties.issuer}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>To</Text>
              <Text style={styles.value}>{snapshot.parties.recipient}</Text>
            </View>
          </>
        )}

        <View style={styles.row}>
          <Text style={styles.label}>Project</Text>
          <Text style={styles.value}>{snapshot.project.title}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Date</Text>
          <Text style={styles.value}>{new Date(snapshot.issuedAt).toLocaleDateString('en-IN')}</Text>
        </View>

        {snapshot.deliverables && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deliverables</Text>
            <Text>{snapshot.deliverables}</Text>
          </View>
        )}

        {snapshot.payments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payments</Text>
            {snapshot.payments.map((p, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.label}>{p.stage.replace(/_/g, ' ')}</Text>
                <Text style={styles.value}>
                  ₹{(p.amountPaise / 100).toLocaleString('en-IN')} — {p.status}
                </Text>
              </View>
            ))}
          </View>
        )}

        {isTax && snapshot.tax && !snapshot.tax.isBillOfSupply ? (
          <View style={styles.section}>
            <View style={styles.row}>
              <Text style={styles.label}>Taxable value</Text>
              <Text style={styles.value}>{rupees(snapshot.tax.taxableAmountPaise)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>GST @ {snapshot.tax.ratePercent}%</Text>
              <Text style={styles.value}>{rupees(snapshot.tax.taxAmountPaise)}</Text>
            </View>
            <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 4 }}>
              Shown as a single GST line. CGST/SGST vs IGST depends on whether both parties are in the
              same state — confirm the split with your accountant before filing.
            </Text>
          </View>
        ) : null}

        {isTax && snapshot.tax?.isBillOfSupply ? (
          <Text style={{ fontSize: 8, color: '#94a3b8', marginTop: 8 }}>
            Bill of Supply — no GST charged. The supplier has not registered a GST number, and an
            unregistered supplier may not collect GST under Indian law.
          </Text>
        ) : null}

        <View style={styles.row}>
          <Text style={[styles.label, { fontSize: 12 }]}>Total</Text>
          <Text style={styles.total}>₹{totalRupees}</Text>
        </View>

        <Text style={styles.footer}>
          Generated by Influnet · {snapshot.number} · {new Date(snapshot.issuedAt).toISOString()}
        </Text>
      </Page>
    </Document>
  );
}
