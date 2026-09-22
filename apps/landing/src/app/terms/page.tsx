import type { Metadata } from 'next';
import LegalView from '@/components/site/legal-view';
import { LEGAL_DOCS } from '@/lib/legal-data';

export const metadata: Metadata = {
  title: 'Terms of Service · Influnet',
  description: 'Terms of service and collaboration conditions for creators and brands using Influnet.',
};

export default function TermsPage() {
  return <LegalView doc={LEGAL_DOCS.terms} />;
}
