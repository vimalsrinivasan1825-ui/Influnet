import Hero from '@/components/landing/hero';
import HowItWorks from '@/components/landing/how-it-works';
import TrustVerification from '@/components/landing/trust-verification';
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
        <Vision />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
