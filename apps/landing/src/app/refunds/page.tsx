import type { Metadata } from 'next';
import LegalView from '@/components/site/legal-view';
import { LEGAL_DOCS } from '@/lib/legal-data';

export const metadata: Metadata = {
  title: 'Cancellation & Refund Policy · Influnet',
  description: 'Rules and procedures governing collaboration cancellations, escrow returns, and payment resolutions.',
};

export default function RefundsPage() {
  return <LegalView doc={LEGAL_DOCS.refunds} />;
}
