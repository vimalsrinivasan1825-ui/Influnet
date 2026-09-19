import type { Metadata } from 'next';
import AppLink from '@/components/site/app-link';

export const metadata: Metadata = {
  title: 'Get the Influnet app',
  description: 'Influnet for iOS and Android — your brand requests, messages and projects on your phone.',
};

// The one link to share for the app (QR codes, bios, emails). Phones go
// straight to their store; everything else sees both buttons.
export default function AppPage() {
  return <AppLink />;
}
