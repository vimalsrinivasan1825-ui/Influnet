'use client';

export default function ProjectsPage() {
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Projects</h1>
        <button className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#ee3e96] to-[#f26e59] shadow-lg shadow-[#ee3e96]/25 hover:shadow-[#ee3e96]/40 hover:-translate-y-0.5 transition-all">
          New Project
        </button>
      </div>
      <div className="p-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
        </div>
        <p className="text-gray-500 text-sm mb-2">No projects yet</p>
        <p className="text-gray-600 text-xs">Create a project to start tracking your campaigns</p>
      </div>
    </div>
  );
}
