'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types & Constants ---
interface StepData {
  number: number;
  title: string;
  description: string;
  focus: 'business' | 'creator' | 'both';
}

// Discovery (search / match) deliberately sits outside this walkthrough. The
// landing page's story starts at the moment a brand actually reaches out —
// finding creators is not the part that goes wrong.
const STEPS: StepData[] = [
  {
    number: 1,
    title: 'Invite Sent',
    description: 'Business sends a direct collaboration request detailing the campaign type, budget, and deliverables.',
    focus: 'business'
  },
  {
    number: 2,
    title: 'Connected',
    description: 'Influencer accepts the incoming request, establishing a secure connection between both parties.',
    focus: 'creator'
  },
  {
    number: 3,
    title: 'Discuss',
    description: 'Both parties use real-time messaging to discuss campaign details, content direction, and expectations.',
    focus: 'both'
  },
  {
    number: 4,
    title: 'Agreement',
    description: 'Terms, timeline, and payment splits are locked and signed by both sides before any work begins.',
    focus: 'both'
  },
  {
    number: 5,
    title: 'Content',
    description: 'Influencer designs and uploads the content deliverables for the brand to review and approve.',
    focus: 'creator'
  },
  {
    number: 6,
    title: 'Payment',
    description: 'Business approves the submitted deliverables, releasing payment securely from escrow to the creator.',
    focus: 'business'
  },
  {
    number: 7,
    title: 'Completed',
    description: 'The campaign completes. Both review final reach metrics, analytics, and payouts in their dashboard.',
    focus: 'both'
  }
];

const STEP_COUNT = STEPS.length;

const SARAH_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80";

// --- Left Side (Business/Brand) Visualizers ---

function BusinessInvite({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-pink-600' : 'text-gray-500'}`}>
            Step 1: Campaign
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-pink-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-pink-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Send Collaboration Invite</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Direct invite with campaign requirements.</p>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-2xl p-4 border transition-all duration-300 ${focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Campaign Type</div>
              <div className={`text-xs font-extrabold truncate transition-colors duration-300 ${focused ? 'text-gray-800' : 'text-gray-700'}`}>Instagram Reels</div>
            </div>
            <div className={`rounded-2xl p-4 border transition-all duration-300 ${focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Deliverables</div>
              <div className={`text-xs font-extrabold transition-colors duration-300 ${focused ? 'text-gray-800' : 'text-gray-700'}`}>3 Reels</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-2xl p-4 border transition-all duration-300 ${focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Budget</div>
              <div className={`text-xs font-extrabold transition-colors duration-300 ${focused ? 'text-gray-800' : 'text-gray-700'}`}>₹50,000</div>
            </div>
            <div className={`rounded-2xl p-4 border transition-all duration-300 ${focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'}`}>
              <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Deadline</div>
              <div className={`text-xs font-extrabold transition-colors duration-300 ${focused ? 'text-gray-800' : 'text-gray-700'}`}>10 Days</div>
            </div>
          </div>
        </div>
      </div>
      <button className={`w-full mt-6 font-extrabold text-sm py-4 rounded-2xl transition-all duration-300 ${
        focused ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-md shadow-pink-500/20 active:scale-[0.98]' : 'bg-gray-100 text-gray-500'
      }`}>
        Send Invite
      </button>
    </div>
  );
}

function BusinessConnected({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-pink-600' : 'text-gray-500'}`}>
            Step 2: Connection
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-green-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-green-500' : 'text-green-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Invite Accepted</h3>
        <p className={`text-sm mb-6 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Influencer accepts the collaboration request.</p>
        
        <div className={`p-5 rounded-2xl border transition-all duration-300 ${focused ? 'bg-green-50 border-green-100' : 'bg-green-50/40 border-green-100/60'}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors duration-300 ${focused ? 'bg-green-100' : 'bg-green-100/80'}`}>
            <svg className={`w-6 h-6 transition-colors duration-300 ${focused ? 'text-green-600' : 'text-green-700'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className={`text-sm font-extrabold mb-1.5 transition-colors duration-300 ${focused ? 'text-green-800' : 'text-green-900'}`}>Invite Accepted!</div>
          <p className={`text-xs leading-relaxed font-medium transition-colors duration-300 ${focused ? 'text-green-600' : 'text-green-700'}`}>
            Sarah Fitness has accepted your collaboration invite.
          </p>
        </div>
      </div>
      <div className="h-10"></div>
    </div>
  );
}

function BusinessDiscuss({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-pink-600' : 'text-gray-500'}`}>
            Step 3: Negotiation
          </span>
          {focused && <span className="w-3 h-3 rounded-full bg-pink-500 animate-pulse"></span>}
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Discuss Details</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Both discuss campaign goals, content and timeline.</p>
        
        <div className="space-y-4 max-h-[170px] overflow-y-auto pr-1">
          <div className={`border rounded-2xl rounded-tr-sm p-3.5 max-w-[90%] ml-auto text-right transition-all duration-300 ${
            focused ? 'bg-pink-50 border-pink-100' : 'bg-pink-50/40 border-pink-100/60'
          }`}>
            <p className={`text-xs font-bold leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-800' : 'text-gray-700'}`}>
              Hi Sarah! We&apos;d love 3 reels for our new protein launch.
            </p>
            <span className={`text-[9px] mt-1 block transition-colors duration-300 ${focused ? 'text-[#ee3e96]/70' : 'text-pink-700/80'}`}>10:30 AM</span>
          </div>
          <div className={`rounded-2xl rounded-tl-sm p-3.5 max-w-[90%] text-left transition-all duration-300 ${
            focused ? 'bg-gray-100' : 'bg-gray-100/70 border border-gray-200/50'
          }`}>
            <p className={`text-xs font-bold leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-700' : 'text-gray-700'}`}>
              Sounds great! I can deliver by next Monday.
            </p>
            <span className={`text-[9px] mt-1 block transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>10:32 AM</span>
          </div>
        </div>
      </div>
      
      <div className={`flex items-center gap-2 border rounded-2xl px-4 py-3 mt-4 transition-all duration-300 ${focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'}`}>
        <span className={`text-xs flex-grow font-semibold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Type a message...</span>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-colors duration-300 ${
          focused ? 'bg-pink-500 hover:bg-pink-600 cursor-pointer' : 'bg-gray-300 cursor-not-allowed'
        }`}>
          <svg className={`w-4 h-4 transition-colors duration-300 ${focused ? 'text-white' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function BusinessAgreement({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-pink-600' : 'text-gray-500'}`}>
            Step 4: Contract
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-pink-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-pink-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Agree & Finalize</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Both agree on terms, budget and timeline.</p>
        
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div className="flex justify-between text-sm">
            <span className={`font-semibold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Deliverables</span>
            <span className={`font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-800'}`}>3 Reels</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className={`font-semibold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Budget</span>
            <span className={`font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-800'}`}>₹50,000</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className={`font-semibold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Deadline</span>
            <span className={`font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-800'}`}>10 Days</span>
          </div>
          <div className={`flex justify-between text-xs p-3 rounded-xl transition-all duration-300 ${
            focused ? 'bg-pink-50 text-pink-700 font-bold' : 'bg-pink-50/40 text-pink-800 font-bold'
          }`}>
            <span>Split:</span>
            <span>50% Advance • 50% On Delivery</span>
          </div>
        </div>
      </div>
      <button className={`w-full mt-6 font-extrabold text-sm py-4 rounded-2xl transition-all duration-300 ${
        focused ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-md active:scale-[0.98]' : 'bg-gray-100 text-gray-500'
      }`}>
        Generate Agreement
      </button>
    </div>
  );
}

function BusinessContent({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-pink-600' : 'text-gray-500'}`}>
            Step 5: Verification
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-pink-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-pink-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Content Progress</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Business tracks content progress in real time.</p>
        
        <div className="space-y-3 font-semibold">
          <div className="flex items-center gap-3 text-sm">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors duration-300 ${focused ? 'bg-green-100 text-green-600' : 'bg-green-50 text-green-700'}`}>✓</div>
            <span className={`transition-colors duration-300 ${focused ? 'text-gray-400 line-through' : 'text-gray-500 line-through'}`}>Creative Brief Shared</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors duration-300 ${focused ? 'bg-green-100 text-green-600' : 'bg-green-50 text-green-700'}`}>✓</div>
            <span className={`transition-colors duration-300 ${focused ? 'text-gray-400 line-through' : 'text-gray-500 line-through'}`}>Content In Progress</span>
          </div>
          <div className={`flex items-center gap-3 text-sm font-extrabold transition-colors duration-300 ${focused ? 'text-pink-600' : 'text-pink-700'}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors duration-300 ${focused ? 'bg-pink-100 text-pink-600' : 'bg-pink-50 text-pink-700'}`}>✓</div>
            <span>Content Submitted</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <div className={`w-5 h-5 rounded-full border-2 transition-colors duration-300 ${focused ? 'border-gray-200' : 'border-gray-300'}`}></div>
            <span className={`transition-colors duration-300 ${focused ? 'text-gray-500' : 'text-gray-600'}`}>Under Review</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <div className={`w-5 h-5 rounded-full border-2 transition-colors duration-300 ${focused ? 'border-gray-200' : 'border-gray-300'}`}></div>
            <span className={`transition-colors duration-300 ${focused ? 'text-gray-500' : 'text-gray-600'}`}>Approved</span>
          </div>
        </div>
      </div>
      <div className="h-6"></div>
    </div>
  );
}

function BusinessPayment({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-pink-600' : 'text-gray-500'}`}>
            Step 6: Payment
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-pink-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-pink-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Release Payment</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Approve final deliverables and release funds.</p>
        
        <div className={`p-4 border rounded-2xl mb-5 flex items-center justify-between transition-all duration-300 ${
          focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'
        }`}>
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-10 h-10 rounded-lg bg-gray-200 overflow-hidden border border-white">
                <img src={SARAH_AVATAR} alt="reels" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <span className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all duration-300 ${
            focused ? 'text-green-600 bg-green-50 border-green-100' : 'text-green-700 bg-green-50/80 border-green-100/60'
          }`}>Campaign Approved</span>
        </div>
        <div className="text-xs text-gray-500 flex justify-between font-semibold">
          <span>Amount: <b className={`transition-colors duration-300 ${focused ? 'text-gray-805 text-sm' : 'text-gray-700 text-sm'}`}>₹50,000</b></span>
          <span>Status: <b className={`transition-colors duration-300 ${focused ? 'text-green-600 text-sm' : 'text-green-700 text-sm'}`}>Ready to Pay</b></span>
        </div>
      </div>
      <button className={`w-full mt-6 font-extrabold text-sm py-4 rounded-2xl transition-all duration-300 ${
        focused ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-md active:scale-[0.98]' : 'bg-gray-100 text-gray-500'
      }`}>
        Release Payment
      </button>
    </div>
  );
}

function BusinessCompleted({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-pink-600' : 'text-gray-500'}`}>
            Step 7: Analytics
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-green-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-green-500' : 'text-green-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Campaign ROI</h3>
        <p className={`text-sm mb-6 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Track campaign performance and overall reach.</p>
        
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className={`border p-3.5 rounded-2xl text-center transition-all duration-300 ${focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Reach</div>
            <div className={`text-lg font-bold mt-0.5 transition-colors duration-300 ${focused ? 'text-gray-800' : 'text-gray-700'}`}>2.4M</div>
            <div className={`text-[10px] font-extrabold transition-colors duration-300 ${focused ? 'text-green-500' : 'text-green-600'}`}>↑ 24%</div>
          </div>
          <div className={`border p-3.5 rounded-2xl text-center transition-all duration-300 ${focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'}`}>
            <div className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Engagement</div>
            <div className={`text-lg font-bold mt-0.5 transition-colors duration-300 ${focused ? 'text-gray-800' : 'text-gray-700'}`}>186K</div>
            <div className={`text-[10px] font-extrabold transition-colors duration-300 ${focused ? 'text-green-500' : 'text-green-600'}`}>↑ 19%</div>
          </div>
        </div>
      </div>
      <div className={`h-14 relative overflow-hidden rounded-2xl border transition-all duration-300 ${focused ? 'border-gray-100 bg-gray-50' : 'border-gray-100 bg-gray-100/50'}`}>
        <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d="M0,40 Q25,18 50,22 T100,4 V40 Z" fill={focused ? "#fbcfe8" : "#f3f4f6"} fillOpacity="0.4" />
          <path d="M0,40 Q25,18 50,22 T100,4" fill="none" stroke={focused ? "#db2777" : "#9ca3af"} strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}

// --- Right Side (Influencer/Creator) Visualizers ---

function CreatorRequest({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-purple-600' : 'text-gray-500'}`}>
            Step 1: Campaign Invite
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-purple-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-purple-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Collaboration Request</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Influencer receives the collaboration request.</p>
        
        <div className={`p-4 border rounded-2xl transition-all duration-300 ${
          focused ? 'border-purple-100 bg-purple-50/20' : 'border-gray-200/50 bg-gray-50/30'
        }`}>
          <div className="flex justify-between items-start mb-3">
            <span className={`text-sm font-bold transition-colors duration-300 ${focused ? 'text-gray-805' : 'text-gray-700'}`}>FitLife Brands</span>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded transition-colors duration-300 ${
              focused ? 'text-purple-700 bg-purple-100' : 'text-purple-700 bg-purple-100/85'
            }`}>New Request</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
            <div className={`p-2.5 rounded-xl border text-center font-extrabold transition-all duration-300 ${focused ? 'bg-white border-gray-100 text-gray-800' : 'bg-white border-gray-100 text-gray-700'}`}>3 Reels</div>
            <div className={`p-2.5 rounded-xl border text-center font-extrabold transition-all duration-300 ${focused ? 'bg-white border-gray-100 text-gray-800' : 'bg-white border-gray-100 text-gray-700'}`}>₹50,000</div>
            <div className={`p-2.5 rounded-xl border text-center font-extrabold transition-all duration-300 ${focused ? 'bg-white border-gray-100 text-gray-800' : 'bg-white border-gray-100 text-gray-700'}`}>10 Days</div>
          </div>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button className={`flex-1 font-extrabold text-xs py-3.5 rounded-xl border transition-all duration-300 ${
          focused ? 'bg-white border-gray-200 text-gray-600' : 'bg-white border-gray-200 text-gray-505'
        }`}>View Details</button>
        <button className={`flex-1 font-extrabold text-xs py-3.5 rounded-xl transition-all duration-300 ${
          focused ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm active:scale-[0.98]' : 'bg-gray-100 text-gray-500'
        }`}>Accept / Decline</button>
      </div>
    </div>
  );
}

function CreatorAccepted({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-purple-600' : 'text-gray-500'}`}>
            Step 2: Status
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-green-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-green-500' : 'text-green-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Request Accepted</h3>
        <p className={`text-sm mb-6 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>You have accepted the collaboration request.</p>
        
        <div className={`p-5 rounded-2xl border transition-all duration-300 ${focused ? 'bg-green-50 border-green-100' : 'bg-green-50/40 border-green-100/60'}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors duration-300 ${focused ? 'bg-green-100' : 'bg-green-100/80'}`}>
            <svg className={`w-6 h-6 transition-colors duration-300 ${focused ? 'text-green-600' : 'text-green-700'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className={`text-sm font-extrabold mb-1.5 transition-colors duration-300 ${focused ? 'text-green-800' : 'text-green-900'}`}>You accepted the request</div>
          <p className={`text-xs leading-relaxed font-medium transition-colors duration-300 ${focused ? 'text-green-600' : 'text-green-700'}`}>
            Let&apos;s start discussing the campaign details.
          </p>
        </div>
      </div>
      <div className="h-10"></div>
    </div>
  );
}

function CreatorDiscuss({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-purple-600' : 'text-gray-500'}`}>
            Step 3: Negotiation
          </span>
          {focused && <span className="w-3 h-3 rounded-full bg-purple-500 animate-pulse"></span>}
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Discuss & Align</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Influencer replies and aligns on requirements.</p>
        
        <div className="space-y-4 max-h-[170px] overflow-y-auto pr-1">
          <div className={`rounded-2xl rounded-tl-sm p-3.5 max-w-[90%] text-left transition-all duration-300 ${
            focused ? 'bg-gray-100' : 'bg-gray-100/70 border border-gray-200/50'
          }`}>
            <p className={`text-xs font-bold leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-705' : 'text-gray-700'}`}>
              Hi Sarah! We&apos;d love 3 reels for our new protein launch.
            </p>
            <span className={`text-[9px] mt-1 block transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-505'}`}>10:30 AM</span>
          </div>
          <div className={`border rounded-2xl rounded-tr-sm p-3.5 max-w-[90%] ml-auto text-right transition-all duration-300 ${
            focused ? 'bg-purple-50 border-purple-100' : 'bg-purple-50/40 border-purple-100/60'
          }`}>
            <p className={`text-xs font-bold leading-relaxed transition-colors duration-300 ${focused ? 'text-purple-900' : 'text-purple-800'}`}>
              Sounds great! I can deliver by next Monday.
            </p>
            <span className={`text-[9px] mt-1 block transition-colors duration-300 ${focused ? 'text-purple-600/70' : 'text-purple-800'}`}>10:32 AM</span>
          </div>
        </div>
      </div>
      
      <div className={`flex items-center gap-2 border rounded-2xl px-4 py-3 mt-4 transition-all duration-300 ${focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-50/50 border-gray-100/60'}`}>
        <span className={`text-xs flex-grow font-semibold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Type a message...</span>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-colors duration-300 ${
          focused ? 'bg-purple-500 hover:bg-purple-600 cursor-pointer' : 'bg-gray-300 cursor-not-allowed'
        }`}>
          <svg className={`w-4 h-4 transition-colors duration-300 ${focused ? 'text-white' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function CreatorAgreement({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-purple-600' : 'text-gray-500'}`}>
            Step 4: Contract Review
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-purple-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-purple-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Review & Agree</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Influencer reviews and confirms the agreement.</p>
        
        <div className="space-y-3 border-t border-gray-100 pt-4">
          <div className="flex justify-between text-sm">
            <span className={`font-semibold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Deliverables</span>
            <span className={`font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-800'}`}>3 Reels</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className={`font-semibold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Budget</span>
            <span className={`font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-800'}`}>₹50,000</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className={`font-semibold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Deadline</span>
            <span className={`font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-800'}`}>10 Days</span>
          </div>
          <div className={`flex justify-between text-xs p-3 rounded-xl transition-all duration-300 ${
            focused ? 'bg-purple-50 text-purple-700 font-bold' : 'bg-purple-50/40 text-purple-800 font-bold'
          }`}>
            <span>Split:</span>
            <span>50% Advance • 50% On Delivery</span>
          </div>
        </div>
      </div>
      <button className={`w-full mt-6 font-extrabold text-sm py-4 rounded-2xl transition-all duration-300 ${
        focused ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md active:scale-[0.98]' : 'bg-gray-100 text-gray-500'
      }`}>
        Agree & Sign
      </button>
    </div>
  );
}

function CreatorContent({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-purple-600' : 'text-gray-500'}`}>
            Step 5: Upload
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-purple-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-purple-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Upload Content</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Influencer uploads final content deliverables.</p>
        
        <div className={`flex items-center justify-between p-4 border rounded-2xl mb-5 transition-all duration-300 ${
          focused ? 'bg-gray-50 border-gray-100' : 'bg-gray-55/50 border-gray-100'
        }`}>
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden border border-white">
                <img src={SARAH_AVATAR} alt="uploaded content" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <span className={`text-xs font-bold transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>3 Reels Uploaded</span>
        </div>
      </div>
      <button className={`w-full mt-6 font-extrabold text-sm py-4 rounded-2xl transition-all duration-300 ${
        focused ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md active:scale-[0.98]' : 'bg-gray-100 text-gray-500'
      }`}>
        Submit for Review
      </button>
    </div>
  );
}

function CreatorPayment({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-purple-600' : 'text-gray-500'}`}>
            Step 6: Payout
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-green-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-green-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Payment Received</h3>
        <p className={`text-sm mb-6 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Influencer receives payment securely.</p>
        
        <div className={`p-5 rounded-2xl border transition-all duration-300 ${focused ? 'bg-green-50 border-green-100' : 'bg-green-50/40 border-green-100/60'}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors duration-300 ${focused ? 'bg-green-100' : 'bg-green-100/80'}`}>
            <svg className={`w-6 h-6 transition-colors duration-300 ${focused ? 'text-green-600' : 'text-green-700'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className={`text-sm font-extrabold mb-1.5 transition-colors duration-300 ${focused ? 'text-green-800' : 'text-green-905'}`}>Payment Received!</div>
          <p className={`text-xs leading-relaxed font-medium transition-colors duration-300 ${focused ? 'text-green-600' : 'text-green-700'}`}>
            ₹50,000 has been credited to your account. Payout completed.
          </p>
        </div>
      </div>
      <div className="h-10"></div>
    </div>
  );
}

function CreatorCompleted({ focused }: { focused: boolean }) {
  return (
    <div className={`rounded-3xl p-7 border transition-all duration-300 h-full flex flex-col justify-between w-full max-w-[420px] mx-auto min-h-[460px] bg-white ${
      focused ? 'border-gray-100 shadow-[0_12px_40px_rgba(0,0,0,0.06)]' : 'border-gray-100/70 shadow-[0_8px_30px_rgba(0,0,0,0.02)]'
    }`}>
      <div>
        <div className="flex items-center justify-between mb-5">
          <span className={`text-xs font-bold tracking-widest uppercase transition-colors duration-300 ${focused ? 'text-purple-600' : 'text-gray-500'}`}>
            Step 7: Payout Summary
          </span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-300 ${focused ? 'bg-green-50' : 'bg-gray-50'}`}>
            <svg className={`w-5 h-5 transition-colors duration-300 ${focused ? 'text-green-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <h3 className={`text-2xl font-extrabold transition-colors duration-300 ${focused ? 'text-gray-900' : 'text-gray-700'}`}>Earnings Summary</h3>
        <p className={`text-sm mb-5 leading-relaxed transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>View earnings and campaign details.</p>
        
        <div className={`p-4 border rounded-2xl mb-4 transition-all duration-300 ${focused ? 'bg-purple-50 border-purple-100' : 'bg-purple-50/40 border-purple-100/60'}`}>
          <div className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${focused ? 'text-gray-400' : 'text-gray-500'}`}>Total Earnings</div>
          <div className={`text-3xl font-bold mt-1 transition-colors duration-300 ${focused ? 'text-purple-700' : 'text-purple-800'}`}>₹50,000</div>
        </div>
        <div className={`flex justify-between items-center text-xs border rounded-xl p-3 transition-all duration-300 ${
          focused ? 'text-gray-500 bg-gray-50 border-gray-100' : 'text-gray-705 bg-gray-50/80 border-gray-200/60'
        }`}>
          <span className="font-bold">FitLife Protein Launch</span>
          <span className={`flex items-center gap-1.5 font-extrabold transition-colors duration-300 ${focused ? 'text-green-600' : 'text-green-700'}`}>
            {focused && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>}
            Completed
          </span>
        </div>
      </div>
      <div className="h-6"></div>
    </div>
  );
}

// --- Component Maps ---
const BUSINESS_VISUALS: Record<number, (props: { focused: boolean }) => React.JSX.Element> = {
  1: BusinessInvite,
  2: BusinessConnected,
  3: BusinessDiscuss,
  4: BusinessAgreement,
  5: BusinessContent,
  6: BusinessPayment,
  7: BusinessCompleted,
};

const CREATOR_VISUALS: Record<number, (props: { focused: boolean }) => React.JSX.Element> = {
  1: CreatorRequest,
  2: CreatorAccepted,
  3: CreatorDiscuss,
  4: CreatorAgreement,
  5: CreatorContent,
  6: CreatorPayment,
  7: CreatorCompleted,
};

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState(1);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const totalHeight = rect.height - window.innerHeight;
      const scrolled = -rect.top; // Amount container has scrolled past viewport top

      if (scrolled < 0) {
        setActiveStep(1);
        setScrollProgress(0);
        setIsSidebarVisible(false);
        return;
      }
      if (scrolled > totalHeight) {
        setActiveStep(STEP_COUNT);
        setScrollProgress(1);
        setIsSidebarVisible(false);
        return;
      }

      // Sidebar is visible ONLY when we are actively inside the sticky scroll session
      setIsSidebarVisible(true);

      const progress = scrolled / totalHeight; // 0 to 1
      setScrollProgress(progress);

      const stepIndex = Math.min(
        Math.max(Math.floor(progress * STEP_COUNT) + 1, 1),
        STEP_COUNT
      );
      setActiveStep(stepIndex);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Trigger on load
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const activeStepData = STEPS[activeStep - 1] || STEPS[0];

  const ActiveBusinessVisual = BUSINESS_VISUALS[activeStep] || BusinessInvite;
  const ActiveCreatorVisual = CREATOR_VISUALS[activeStep] || CreatorRequest;

  const isBusinessFocused = true;
  const isCreatorFocused = true;

  return (
    // Desktop locks a tall scroll container for the sticky step transitions —
    // roughly 60vh of scroll per step, so it must shrink when STEPS does.
    // On mobile the section is natural-height and the stacked layout flows normally.
    <section
      id="how-it-works"
      className="steps-scroll relative w-full bg-[var(--paper)]"
      style={{ ['--steps-height' as string]: `${STEP_COUNT * 60}vh` }}
      ref={containerRef}
    >

      {/* Sticky Viewport Container (sticky/pinned on desktop only) */}
      <div className="relative w-full flex flex-col justify-center z-10 py-10 lg:sticky lg:top-0 lg:h-screen lg:overflow-hidden lg:py-16">

        {/* Scroll Progress Bar at the top of the sticky screen (desktop only) */}
        <div className="hidden lg:block absolute top-0 left-0 w-full h-1.5 bg-gray-100 z-50">
          <div 
            className="h-full bg-[var(--magenta)] transition-all duration-75"
            style={{ width: `${scrollProgress * 100}%` }}
          />
        </div>

        {/* Floating Sidebar Scroll Indicator (Fades in ONLY when section is active) */}
        <div className={`hidden xl:flex flex-col items-center gap-4 fixed right-6 top-1/2 -translate-y-1/2 z-40 bg-white/95 backdrop-blur-md px-3 py-6 rounded-3xl border border-gray-200/50 shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition-all duration-500 ${
          isSidebarVisible ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-12 pointer-events-none'
        }`}>
          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-[0.2em] [writing-mode:vertical-lr] rotate-180 mb-2">
            PROGRESS
          </span>
          <div className="relative w-1.5 h-44 bg-gray-100 rounded-full mb-3 overflow-hidden">
            <div 
              className="absolute top-0 left-0 w-full bg-[var(--magenta)] rounded-full transition-all duration-75"
              style={{ height: `${scrollProgress * 100}%` }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            {STEPS.map((s) => (
              <button
                key={s.number}
                onClick={() => {
                  if (!containerRef.current) return;
                  const rect = containerRef.current.getBoundingClientRect();
                  const totalHeight = containerRef.current.scrollHeight - window.innerHeight;
                  const targetScroll = rect.top + window.scrollY + (totalHeight * ((s.number - 1) / 8));
                  window.scrollTo({ top: targetScroll, behavior: 'smooth' });
                }}
                className={`w-6 h-6 rounded-full text-[10px] font-bold border flex items-center justify-center transition-all ${
                  activeStep === s.number
                    ? 'bg-[var(--magenta)] text-white border-transparent scale-110 shadow-md shadow-pink-500/10'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                }`}
                title={s.title}
              >
                {s.number}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 w-full flex flex-col justify-between lg:h-[82vh]">
          
          {/* Header Title (Apple-style Typography) */}
          <div className="text-center">
            <p className="eyebrow mb-3">Seven steps, both sides</p>
            <h2 className="mb-3 font-display text-3xl font-bold leading-[1.06] tracking-[-0.03em] text-[var(--ink)] text-balance sm:text-4xl lg:text-[2.8rem]">
              What happens after they say yes
            </h2>
            <p className="mx-auto max-w-2xl px-4 text-sm leading-relaxed text-[var(--ink-soft)] sm:text-base">
              Every step below needs both the brand and the creator to act. Nothing
              advances because one side decided it had — and the money moves only when
              the work is signed off.
            </p>
          </div>

          {/* Desktop Interactive Layout (Sticky Columns with Highlight Focus) */}
          <div className="hidden lg:grid grid-cols-12 gap-6 items-center flex-grow py-8 relative animate-none">
            
            {/* Left Column (💼 Business / Brand) */}
            <div className="col-span-4 flex flex-col items-center justify-center h-[500px]">
              <div className="text-center mb-4.5 h-[50px] flex items-center justify-center">
                <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-350 shadow-sm ${
                  isBusinessFocused 
                    ? 'bg-[var(--magenta)] text-white scale-110 shadow-[0_6px_20px_rgba(236,72,153,0.3)] border-transparent' 
                    : 'bg-pink-50 text-pink-500 border border-pink-100/60 scale-95 shadow-none'
                }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Business / Brand
                </span>
              </div>
              <motion.div
                animate={{
                  scale: isBusinessFocused ? 1.03 : 0.97,
                  y: isBusinessFocused ? 0 : 4
                }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                className={`w-full h-full relative rounded-3xl transition-all duration-300 ${
                  isBusinessFocused 
                    ? 'shadow-[0_20px_50px_rgba(236,72,153,0.08)] ring-2 ring-pink-500/10' 
                    : 'ring-0 shadow-none'
                }`}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeStep}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <ActiveBusinessVisual focused={isBusinessFocused} />
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Center Column (Apple-style bold titles & descriptions) */}
            <div className="col-span-4 flex flex-col items-center justify-center text-center px-4 self-center h-[350px]">
              <div className="relative flex flex-col items-center">
                
                {/* Active Step Indicator */}
                <motion.div
                  key={activeStep}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.25, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 20 }}
                  className="w-14 h-14 rounded-full bg-[var(--magenta)] text-white flex items-center justify-center text-xl font-bold shadow-lg shadow-pink-500/20 mb-6"
                >
                  {activeStep}
                </motion.div>

                {/* Animated Heading & Text */}
                <div className="h-[180px] flex flex-col justify-start">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeStep}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -15 }}
                      transition={{ duration: 0.25 }}
                    >
                      <h4 className="text-3xl font-bold text-gray-900 tracking-tight mb-3">
                        {activeStepData.title}
                      </h4>
                      <p className="text-base font-bold text-gray-500 leading-relaxed max-w-sm mx-auto">
                        {activeStepData.description}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Scroll Indicator dots */}
                <div className="flex gap-2.5 mt-4">
                  {STEPS.map((s) => (
                    <div
                      key={s.number}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        activeStep === s.number ? 'w-6 bg-pink-500' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

              </div>
            </div>

            {/* Right Column (👤 Influencer / Creator) */}
            <div className="col-span-4 flex flex-col items-center justify-center h-[500px]">
              <div className="text-center mb-4.5 h-[50px] flex items-center justify-center">
                <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-350 shadow-sm ${
                  isCreatorFocused 
                    ? 'bg-[var(--ink)] text-white scale-110 shadow-[0_6px_20px_rgba(147,51,234,0.3)] border-transparent' 
                    : 'bg-purple-50 text-purple-500 border border-purple-100/60 scale-95 shadow-none'
                }`}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Influencer / Creator
                </span>
              </div>
              <motion.div
                animate={{
                  scale: isCreatorFocused ? 1.03 : 0.97,
                  y: isCreatorFocused ? 0 : 4
                }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                className={`w-full h-full relative rounded-3xl transition-all duration-300 ${
                  isCreatorFocused 
                    ? 'shadow-[0_20px_50px_rgba(147,51,234,0.08)] ring-2 ring-purple-500/10' 
                    : 'ring-0 shadow-none'
                }`}
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeStep}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <ActiveCreatorVisual focused={isCreatorFocused} />
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </div>

          </div>

          {/* Mobile Stack Layout (natural document flow — no inner scroll) */}
          <div className="lg:hidden">
            <div className="space-y-14 py-4">
              {STEPS.map((step) => {
                const BusinessComp = BUSINESS_VISUALS[step.number] || BusinessInvite;
                const CreatorComp = CREATOR_VISUALS[step.number] || CreatorRequest;
                
                return (
                  <div key={step.number} className="border-b border-gray-100 pb-10 last:border-0 last:pb-0">
                    <div className="flex items-center gap-3 mb-6 justify-center">
                      <div className="w-10 h-10 rounded-full bg-[var(--magenta)] text-white flex items-center justify-center text-sm font-bold shadow-md shadow-pink-500/15">
                        {step.number}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
                        <p className="text-xs text-gray-400 font-bold leading-tight">{step.description}</p>
                      </div>
                    </div>
                    
                    <div className="grid sm:grid-cols-2 gap-5 max-w-xl mx-auto">
                      <div className="space-y-2">
                        <div className="text-center text-[10px] font-bold text-pink-600 tracking-wide uppercase">💼 Business</div>
                        <div className="border border-gray-100 rounded-3xl p-1 bg-white">
                          <BusinessComp focused={true} />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-center text-[10px] font-bold text-purple-600 tracking-wide uppercase">👤 Influencer</div>
                        <div className="border border-gray-100 rounded-3xl p-1 bg-white">
                          <CreatorComp focused={true} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
