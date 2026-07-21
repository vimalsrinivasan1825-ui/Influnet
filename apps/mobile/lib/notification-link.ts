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

    case 'requests':
      return id ? { pathname: '/requests/[id]', params: { id } } : '/requests';

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
      return '/profile';

    default:
      return null;
  }
}
