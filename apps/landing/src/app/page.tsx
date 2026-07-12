import Nav from "@/components/nav";
import Hero from "@/components/hero";
import Stats from "@/components/stats";
import Problem from "@/components/problem";
import HowItWorks from "@/components/how-it-works";
import Platform from "@/components/platform";
import Trust from "@/components/trust";
import Cta from "@/components/cta";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Stats />
        <Problem />
        <HowItWorks />
        <Platform />
        <Trust />
        <Cta />
      </main>
      <Footer />
    </>
  );
}
