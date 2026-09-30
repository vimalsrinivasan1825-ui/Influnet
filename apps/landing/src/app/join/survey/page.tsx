import type { Metadata } from 'next';
import EventSurvey from '@/components/event/event-survey';

// Pre-event questionnaire for registered attendees: phone → their registration
// → a short creator or business survey. Not linked from ads; shared at the venue.

export const metadata: Metadata = {
  title: 'While you wait — Silicon Nexus S2 | Influnet',
  description: 'A two-minute survey for Silicon Nexus S2 attendees: help shape Influnet for creators and businesses.',
  robots: { index: false, follow: false },
};

export default function EventSurveyPage() {
  return <EventSurvey />;
}
