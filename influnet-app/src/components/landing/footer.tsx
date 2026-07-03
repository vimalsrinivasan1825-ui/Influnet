import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <svg className="w-7 h-7" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="6" fill="#ee3e96" />
                <circle cx="8" cy="12" r="3" fill="#ee3e96" opacity="0.6" />
                <circle cx="32" cy="12" r="3" fill="#ee3e96" opacity="0.6" />
                <circle cx="8" cy="28" r="3" fill="#ee3e96" opacity="0.6" />
                <circle cx="32" cy="28" r="3" fill="#ee3e96" opacity="0.6" />
                <line x1="20" y1="20" x2="8" y2="12" stroke="#ee3e96" strokeWidth="1.5" opacity="0.4" />
                <line x1="20" y1="20" x2="32" y2="12" stroke="#ee3e96" strokeWidth="1.5" opacity="0.4" />
                <line x1="20" y1="20" x2="8" y2="28" stroke="#ee3e96" strokeWidth="1.5" opacity="0.4" />
                <line x1="20" y1="20" x2="32" y2="28" stroke="#ee3e96" strokeWidth="1.5" opacity="0.4" />
              </svg>
              <span className="text-lg font-bold text-gray-900">influnet</span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              The Business Operating System for Influencers & Brands.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Platform</h3>
            <ul className="space-y-2.5">
              <li>
                <Link href="/#opportunities" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  For Business
                </Link>
              </li>
              <li>
                <Link href="/#creator-economy" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  For Creators
                </Link>
              </li>
              <li>
                <Link href="/#why-exists" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Why Us
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Company</h3>
            <ul className="space-y-2.5">
              <li>
                <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Log In
                </Link>
              </li>
              <li>
                <Link href="/signup/influencer" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                  Sign Up
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Legal</h3>
            <ul className="space-y-2.5">
              <li>
                <span className="text-sm text-gray-500">Privacy Policy</span>
              </li>
              <li>
                <span className="text-sm text-gray-500">Terms of Service</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-8 text-center">
          <p className="text-sm text-gray-400">
            &copy; {new Date().getFullYear()} Influnet. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
