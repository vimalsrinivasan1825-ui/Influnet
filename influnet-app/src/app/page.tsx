import Hero from '@/components/landing/hero';
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
