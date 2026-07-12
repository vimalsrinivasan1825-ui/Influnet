"use client";

import Image from "next/image";
import { links } from "@/lib/site";

const NAV_ITEMS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Platform", href: "#platform" },
  { label: "Trust", href: "#trust" },
];

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="#" className="flex items-center gap-2.5">
          <Image
            src="/influet_logo.png"
            alt=""
            width={26}
            height={26}
            className="h-[26px] w-auto"
          />
          <span className="font-display text-[1.35rem] font-bold tracking-tight text-ink">
            influnet
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href={links.login}
            className="hidden text-sm font-medium text-ink-soft transition-colors hover:text-ink sm:block"
          >
            Log in
          </a>
          <a
            href={links.signup}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-ink/85"
          >
            Get started
          </a>
        </div>
      </nav>
    </header>
  );
}
