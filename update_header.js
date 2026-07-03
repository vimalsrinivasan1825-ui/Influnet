const fs = require('fs');
const path = 'influnet-app/src/components/landing/header.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  'className="text-sm font-semibold text-white px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#ee3e96] to-[#f26e59] shadow-lg shadow-[#ee3e96]/25 hover:shadow-[#ee3e96]/40 hover:-translate-y-0.5 transition-all"',
  'className="text-sm font-semibold text-black px-5 py-2.5 rounded-xl bg-white shadow-lg shadow-white/10 hover:shadow-white/20 hover:-translate-y-0.5 transition-all"'
);

fs.writeFileSync(path, content);
console.log('Update complete.');
