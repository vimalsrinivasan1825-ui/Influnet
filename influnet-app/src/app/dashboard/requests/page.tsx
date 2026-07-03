'use client';

export default function RequestsPage() {
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Collaboration Requests</h1>
      </div>
      <div className="p-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </div>
        <p className="text-gray-500 text-sm mb-2">No requests yet</p>
        <p className="text-gray-600 text-xs">Collaboration requests will appear here</p>
      </div>
    </div>
  );
}
