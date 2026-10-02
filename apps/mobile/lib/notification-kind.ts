/**
 * How each notification type looks in the notification center: its icon, the
 * colour pair it sits on, and the action the row offers ("Review", "See who").
 *
 * Types are free text in public.notifications (migration 047 has no CHECK), so
 * the web's NotificationType union in apps/web/src/lib/notify.ts is the list —
 * an unknown type still renders, as a plain bell.
 */
import {
  BadgeCheck,
  Bell,
  CalendarClock,
  CheckCircle2,
  Crown,
  Eye,
  FolderKanban,
  Megaphone,
  MessageSquare,
  OctagonAlert,
  Send,
  Sparkles,
  XCircle,
  type LucideIcon,
} from 'lucide-react-native';
import type { Theme } from '@/lib/theme';

export interface NotificationKind {
  Icon: LucideIcon;
  /** Icon colour. */
  color: string;
  /** Disc behind the icon. */
  soft: string;
  /** Short verb shown on the row when it leads somewhere. */
  action: string;
}

export function notificationKind(type: string | null | undefined, t: Theme): NotificationKind {
  const c = t.color;
  switch (type) {
    case 'collab_request':
      return { Icon: Send, color: c.brand, soft: c.brandSoft, action: 'Review' };
    case 'collab_accepted':
      return { Icon: CheckCircle2, color: c.ok, soft: c.okSoft, action: 'Open chat' };
    case 'collab_declined':
      return { Icon: XCircle, color: c.contentMuted, soft: c.surface, action: 'View' };
    case 'project_stage':
      return { Icon: FolderKanban, color: c.info, soft: c.infoSoft, action: 'Open project' };
    case 'project_cancel':
      return { Icon: OctagonAlert, color: c.danger, soft: c.dangerSoft, action: 'Open project' };
    case 'message':
      return { Icon: MessageSquare, color: c.info, soft: c.infoSoft, action: 'Reply' };
    case 'verification':
      return { Icon: BadgeCheck, color: c.verified, soft: c.verifiedSoft, action: 'Open' };
    case 'profile_view':
      return { Icon: Eye, color: c.brand, soft: c.brandSoft, action: 'See who' };
    case 'nudge':
      return { Icon: Sparkles, color: c.brand, soft: c.brandSoft, action: 'Open' };
    case 'upsell':
      return { Icon: Crown, color: c.warn, soft: c.warnSoft, action: 'See plans' };
    case 'announcement':
      return { Icon: Megaphone, color: c.brand, soft: c.brandSoft, action: 'Open' };
    case 'reminder':
      return { Icon: CalendarClock, color: c.warn, soft: c.warnSoft, action: 'Open' };
    default:
      return { Icon: Bell, color: c.contentSoft, soft: c.surface, action: 'Open' };
  }
}
