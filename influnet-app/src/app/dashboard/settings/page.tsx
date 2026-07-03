'use client';

export default function SettingsPage() {
  return (
    <div className="p-6 sm:p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Account Settings</h1>
      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <h3 className="text-lg font-bold text-white mb-4">Profile</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Name</label>
              <input type="text" placeholder="Your name" className="w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Email</label>
              <input type="email" placeholder="your@email.com" className="w-full" disabled />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Phone</label>
              <input type="tel" placeholder="+91 98765 43210" className="w-full" />
            </div>
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <h3 className="text-lg font-bold text-white mb-4">Password</h3>
          <button className="px-4 py-2 rounded-xl text-sm font-medium text-gray-300 border border-white/10 hover:bg-white/5 transition-all">
            Change Password
          </button>
        </div>
      </div>
    </div>
  );
}
