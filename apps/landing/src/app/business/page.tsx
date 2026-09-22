import type { Metadata } from 'next';
import BusinessPage from '@/components/business-page';
import RememberRole from '@/components/brand/remember-role';
import PageIntro from '@/components/gate/page-intro';

export const metadata: Metadata = {
  title: 'Influnet for brands — run creator collaborations like a business',
};

export default function Business() {
  return (
    <>
      <noscript>
        <style>{'[data-reveal]{visibility:visible!important}[data-page-intro]{display:none}'}</style>
      </noscript>
      <RememberRole role="business" />
      <PageIntro />
      <BusinessPage />
    </>
  );
}
