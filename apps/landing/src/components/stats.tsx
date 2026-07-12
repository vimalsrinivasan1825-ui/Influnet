const STATS = [
  { value: "8M+", label: "Creators in India" },
  { value: "₹3,375 Cr", label: "India market by 2026" },
  { value: "50M+", label: "Creators worldwide" },
  { value: "$32B+", label: "Global market size" },
];

export default function Stats() {
  return (
    <section className="border-y border-line bg-paper-deep/50">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-5 py-10 sm:px-8 lg:grid-cols-4">
        {STATS.map((stat) => (
          <div key={stat.label}>
            <dd className="font-display text-3xl font-bold tracking-tight text-ink lg:text-[2.1rem]">
              {stat.value}
            </dd>
            <dt className="mt-1.5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
              {stat.label}
            </dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
