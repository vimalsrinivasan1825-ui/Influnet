import type { Metadata } from 'next';
import CreatorPage from '@/components/creators/creator-page';
import RememberRole from '@/components/brand/remember-role';
import PageIntro from '@/components/gate/page-intro';

export const metadata: Metadata = {
  title: 'Influnet for creators — your brand deals deserve better than your DMs',
  description:
    'One profile for every collaboration. See who the brand is, agree terms in writing, and get the advance confirmed before you shoot.',
};

export default function Creators() {
  return (
    <>
      <noscript>
        <style>{'[data-reveal]{visibility:visible!important}[data-page-intro]{display:none}'}</style>
      </noscript>
      <RememberRole role="creator" />
      <PageIntro />
      <CreatorPage />
    </>
  );
}
