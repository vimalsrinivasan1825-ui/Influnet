import Image from "next/image";
import { links } from "@/lib/site";

const COLUMNS = [
  {
    label: "Platform",
    items: [
      { label: "How it works", href: "#how-it-works" },
      { label: "For brands", href: links.signupBusiness },
      { label: "For creators", href: links.signupInfluencer },
      { label: "Trust & verification", href: "#trust" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Log in", href: links.login },
      { label: "Sign up", href: links.signup },
    ],
  },
  {
    label: "Legal",
    items: [
      { label: "Privacy policy", href: "#" },
      { label: "Terms of service", href: "#" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-line bg-paper-deep/50">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <a href="#" className="flex items-center gap-2.5">
              <Image
                src="/influet_logo.png"
                alt=""
                width={24}
                height={24}
                className="h-6 w-auto"
              />
              <span className="font-display text-xl font-bold tracking-tight text-ink">
                influnet
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              The business layer between brands and creators. Find each other,
              agree terms, deliver — on the record.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.label} aria-label={col.label}>
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-muted">
                {col.label}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-line pt-6">
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
            © 2026 Influnet · Made in India
          </p>
        </div>
      </div>
    </footer>
  );
}
