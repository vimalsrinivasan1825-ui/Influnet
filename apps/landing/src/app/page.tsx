import Hero from '@/components/landing/hero';
import ReplyGap from '@/components/landing/reply-gap';
import HowItWorks from '@/components/landing/how-it-works';
import TrustVerification from '@/components/landing/trust-verification';
import CreatorCarousel from '@/components/landing/creator-carousel';
import TrustCarousel from '@/components/landing/trust-carousel';
import Vision from '@/components/landing/vision';
import Cta from '@/components/landing/cta';
import Footer from '@/components/landing/footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <main>
        <Hero />
        <ReplyGap />
        <HowItWorks />
        <TrustVerification />
        <CreatorCarousel />
        <TrustCarousel />
        <Vision />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
