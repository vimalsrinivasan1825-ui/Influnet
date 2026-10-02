/**
 * Translates a notification's `link` into a route this app actually has.
 *
 * Notifications are written by the web app for the web app: notify.ts stores
 * paths like `/dashboard/projects/12` and `/dashboard/messages?conv=<uuid>`.
 * Mobile has no /dashboard segment and names two of those screens differently,
 * so pushing the stored value straight into the router lands on the "unmatched
 * route" screen. The rows are shared, so the mapping has to live on this side.
 *
 * Unknown shapes return null on purpose: a row that isn't tappable is a much
 * smaller failure than one that navigates into a dead end.
 */
import type { Href } from 'expo-router';

export function toMobileHref(link: string | null | undefined): Href | null {
  if (!link) return null;

  // Only in-app dashboard paths are translatable. Anything absolute is somebody
  // else's URL and has no business being pushed onto this stack.
  if (!link.startsWith('/')) return null;

  const [rawPath, rawQuery] = link.split('?');
  const query = new URLSearchParams(rawQuery ?? '');
  const path = rawPath.replace(/\/+$/, '');

  const segments = path.split('/').filter(Boolean);
  if (segments[0] !== 'dashboard') return null;

  const [, section, id] = segments;

  switch (section) {
    // `/dashboard` alone is the home dashboard.
    case undefined:
      return '/home';

    case 'projects':
      return id ? { pathname: '/projects/[id]', params: { id } } : '/projects';

    case 'messages': {
      // The web passes the conversation as ?conv=; mobile routes on the path.
      const conversationId = query.get('conv') ?? id;
      return conversationId
        ? { pathname: '/conversations/[id]', params: { id: conversationId } }
        : '/messages';
    }

    case 'requests': {
      // The web has no single-request page, so links name the request as
      // ?id= on the list path; here it opens that exact request.
      const requestId = id ?? query.get('id');
      return requestId ? { pathname: '/requests/[id]', params: { id: requestId } } : '/requests';
    }

    case 'campaigns':
      return id && id !== 'new' ? { pathname: '/campaigns/[id]', params: { id } } : '/campaigns';

    case 'profile-viewers':
      return '/profile-viewers';
    case 'billing':
      return '/billing';
    case 'home':
      return '/home';

    case 'activity':
      return '/activity';
    case 'connections':
      return '/connections';
    case 'settings':
      return '/settings';
    case 'verification':
      return '/verification';
    case 'notifications':
      return '/notifications';
    case 'profile':
      // `/dashboard/profile/design` → the public-profile design editor.
      return id === 'design' ? '/profile-design' : '/profile';

    default:
      return null;
  }
}

/**
 * Where tapping a notification should land — the exact screen, not the area.
 *
 * Mostly `toMobileHref(link)`, but a few rows carry a link that is right for
 * the web and wrong here. The verification decisions written by SQL
 * (migrations 055/086) link to /dashboard/settings, where the web shows the
 * verification panel; on mobile that is a separate screen, and landing on
 * Settings made people hunt for it. The type says what the row is about, so
 * it wins over the link for those.
 */
export function notificationHref(n: { type?: string | null; link?: string | null }): Href | null {
  switch (n.type) {
    case 'verification':
      return '/verification';
    case 'profile_view':
      return '/profile-viewers';
    default:
      return toMobileHref(n.link);
  }
}
