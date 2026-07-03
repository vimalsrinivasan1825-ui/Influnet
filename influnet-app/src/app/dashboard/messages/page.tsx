'use client';

export default function MessagesPage() {
  return (
    <div className="flex h-full">
      <div className="w-80 border-r border-white/5 bg-[#0a0e1a]/50 p-4">
        <h2 className="text-lg font-bold text-white mb-4">Messages</h2>
        <div className="space-y-2">
          <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center text-sm text-gray-500">
            No conversations yet
          </div>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">Select a conversation to start chatting</p>
        </div>
      </div>
    </div>
  );
}
