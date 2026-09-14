import { redirect } from 'next/navigation';

/** /legal has no index of its own — Terms is the front door. */
export default function LegalIndex() {
  redirect('/legal/terms');
}
