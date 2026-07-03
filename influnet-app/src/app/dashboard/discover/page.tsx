'use client';

export default function DiscoverPage() {
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Discover</h1>
      </div>
      <div className="mb-6">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search creators by name, niche, or location..."
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder-gray-500"
          />
        </div>
      </div>
      <div className="p-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
        <p className="text-gray-500 text-sm">Search for creators to discover</p>
      </div>
    </div>
  );
}
