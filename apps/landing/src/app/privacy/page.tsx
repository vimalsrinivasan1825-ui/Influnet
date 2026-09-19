import type { Metadata } from 'next';
import LegalView from '@/components/site/legal-view';
import { LEGAL_DOCS } from '@/lib/legal-data';

export const metadata: Metadata = {
  title: 'Privacy Policy · Influnet',
  description: 'How Influnet collects, uses, protects, and stores personal data for creators and brands.',
};

export default function PrivacyPage() {
  return <LegalView doc={LEGAL_DOCS.privacy} />;
}
