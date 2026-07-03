const fs = require('fs');

const path = 'influnet-app/src/components/landing/hero.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace emojis with SVG icons
const icons = {
  skincare: `<svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>`,
  apparel: `<svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>`,
  summer: `<svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>`
};

content = content.replace(/icon:\s*'🧴',/g, `icon: ${icons.skincare},`);
content = content.replace(/icon:\s*'👔',/g, `icon: ${icons.apparel},`);
content = content.replace(/icon:\s*'☀️',/g, `icon: ${icons.summer},`);

// Make buttons black with white text
content = content.replace(
  'className="group inline-flex items-center gap-2 px-7 py-4 bg-gray-900 text-white font-semibold rounded-full hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"',
  'className="group inline-flex items-center gap-2 px-7 py-4 bg-black text-white font-semibold rounded-full hover:bg-gray-900 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"'
);

content = content.replace(
  'className="group inline-flex items-center gap-2 px-7 py-4 bg-white text-gray-700 font-semibold rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"',
  'className="group inline-flex items-center gap-2 px-7 py-4 bg-black text-white font-semibold rounded-full border border-gray-800 hover:bg-gray-900 transition-all"'
);

content = content.replace(
  '<div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors">',
  '<div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center group-hover:bg-gray-700 transition-colors">'
);

content = content.replace(
  '<svg className="w-3.5 h-3.5 text-gray-600 ml-0.5" fill="currentColor" viewBox="0 0 24 24">',
  '<svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">'
);

// Restructure the floating cards logic
content = content.replace(
  "style: { top: '5%', right: '2%' }",
  "style: { top: '10%', right: '10%' }"
);
content = content.replace(
  "style: { top: '8%', left: '5%' }",
  "style: { top: '15%', left: '10%' }"
);
content = content.replace(
  "style: { top: '40%', left: '0%' }",
  "style: { top: '45%', left: '0%' }"
);
content = content.replace(
  "style: { top: '35%', right: '0%' }",
  "style: { top: '40%', right: '0%' }"
);
content = content.replace(
  "style: { bottom: '22%', left: '5%' }",
  "style: { bottom: '15%', left: '10%' }"
);
content = content.replace(
  "style: { bottom: '15%', right: '5%' }",
  "style: { bottom: '10%', right: '10%' }"
);
content = content.replace(
  "style: { bottom: '30%', right: '18%' }",
  "style: { bottom: '30%', right: '25%' }"
);
content = content.replace(
  "style: { bottom: '5%', left: '30%' }",
  "style: { bottom: '0%', left: '30%' }"
);
content = content.replace(
  "style: { top: '12%', left: '45%' }",
  "style: { top: '5%', left: '45%' }"
);


fs.writeFileSync(path, content);
console.log('Update complete.');
