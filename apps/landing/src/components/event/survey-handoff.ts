// Survey → /join → survey, for someone who opens /join/survey before registering.
//
// The survey sends them to /join?next=survey with the number they typed held
// here; /join prefills it and, once the pass is issued, sends them back to
// /join/survey?from=join, which looks the number up on its own.
//
// The number travels in sessionStorage, never in the URL: /join loads the Meta
// Pixel, which records page URLs. sessionStorage is per tab, so it can't leak
// into someone else's visit on a shared phone either.

const KEY = 'influnet.survey.phone';

export const SURVEY_JOIN_URL = '/join?next=survey';
export const SURVEY_RETURN_URL = '/join/survey?from=join';

export function setHandoffPhone(phone: string) {
  try {
    sessionStorage.setItem(KEY, phone);
  } catch {
    /* private mode: they just type the number again */
  }
}

export function takeHandoffPhone(): string {
  try {
    const v = sessionStorage.getItem(KEY) ?? '';
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return '';
  }
}

export function peekHandoffPhone(): string {
  try {
    return sessionStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** True on /join when the visitor came from the survey. */
export function cameFromSurvey(): boolean {
  return new URLSearchParams(window.location.search).get('next') === 'survey';
}
