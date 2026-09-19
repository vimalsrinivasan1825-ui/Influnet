import type { FaqItem } from '@/components/site/faq';

// One source for every answer the site gives: the FAQ sections and the help
// bot both read from here. Every answer is checked against apps/web — no
// pricing, commission or payout-timing answers until those are decided.

export const CREATOR_FAQS: FaqItem[] = [
  { q: 'Is Influnet free for creators?', a: 'Yes, creating your profile is free. Set it up, connect your socials and share your link without paying anything.' },
  { q: 'Do I have to give my Instagram password?', a: 'No. You prove the account is yours by adding your Influnet profile link to your Instagram bio. Influnet never asks for your password.' },
  { q: 'How do I know a brand is genuine?', a: 'Every business is reviewed by the Influnet team. Until a business is approved, its requests carry an "unverified" label, so you always know. You can also report or block any account.' },
  { q: 'How do payments work?', a: 'You and the brand agree the amount and the split before work starts. The brand pays the advance and final amounts through Razorpay on the project, and the project cannot move past a payment stage until that payment is confirmed.' },
  { q: 'Which platforms can I connect?', a: 'Instagram, YouTube, Facebook, X and Snapchat, all shown together on your profile.' },
  { q: 'Can I find brands myself?', a: 'Yes. Brands post open campaigns on Influnet, and you can browse them and apply to the ones that fit your content.' },
];

export const BUSINESS_FAQS: FaqItem[] = [
  {
    q: 'How do I know a creator is real?',
    a: 'Creators prove they own their Instagram account by adding their Influnet profile link to their bio. Their follower and engagement numbers come from their public profiles rather than being typed in by hand.',
  },
  {
    q: 'Why does my business need to be reviewed?',
    a: 'The Influnet team reviews every business so creators know who is contacting them. While you wait you can still send requests, which creators see marked as unverified. Publishing an open campaign needs an approved business.',
  },
  {
    q: 'How do payments work?',
    a: 'You and the creator agree the amount and the split first. You pay the advance and final amounts through Razorpay on the project, and the project cannot move past a payment stage until your payment is confirmed.',
  },
  {
    q: 'Will I get invoices?',
    a: 'Every project keeps its payment records, with downloadable documents that include your GST number if you added one to your business profile.',
  },
  {
    q: 'Can creators come to me?',
    a: 'Yes. Post an open campaign and creators apply with their profile and past work. You review them and accept the ones that fit.',
  },
  {
    q: 'What if a collaboration goes wrong?',
    a: 'Most stages need both sides to sign off before a project moves on, so nothing changes without you. You can also report or block any account.',
  },
];
