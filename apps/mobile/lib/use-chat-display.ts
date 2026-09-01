/**
 * How the chat thread is displayed: text size, and whether the paper shows.
 *
 * ── WHY TEXT SIZE IS A CHAT SETTING AND NOT A SYSTEM ONE ──────────────
 *
 * The OS already has a global text size, and honouring it (which the app does,
 * via `allowFontScaling`) is the accessibility floor. This is a different
 * thing: a chat is the one screen in this app people read for minutes at a
 * stretch, often outdoors, often one-handed, and the size that suits a chat is
 * routinely not the size someone wants for every button and label on their
 * phone. Every messenger ships this control for that reason.
 *
 * It MULTIPLIES rather than replaces, so it composes with the OS setting
 * instead of fighting it — someone who has already scaled their whole phone up
 * gets a bigger chat still, not a reset to our idea of large.
 *
 * ── AND WHY IT IS ASYNCSTORAGE ────────────────────────────────────────
 *
 * The same reasoning as the verification nudge and the requests tip: the
 * server-side equivalent needs a migration, and migrations reach the hosted
 * databases well after the code does. A preference that fails to load is a
 * preference at its default, which is harmless; a preference that needs a
 * column that is not there yet is a broken screen.
 *
 * Preference is per ACCOUNT, not per install. A shared device must not hand
 * the second person the first person's settings.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ChatTextSize = 'small' | 'default' | 'large' | 'xl';

export interface ChatDisplay {
  textSize: ChatTextSize;
  /** The patterned paper behind the messages. */
  wallpaper: boolean;
}

const DEFAULTS: ChatDisplay = { textSize: 'default', wallpaper: true };

const STORAGE_PREFIX = 'influnet:chat-display:';

/**
 * Multipliers, not point sizes.
 *
 * Applied to the bubble's own type scale so the whole thread — body, the
 * timestamp under it, the attachment title — grows together. Sizing only the
 * message body would leave 11pt metadata under 22pt text, which is a worse
 * reading experience than the size it was meant to fix.
 */
export const TEXT_SCALE: Record<ChatTextSize, number> = {
  small: 0.88,
  default: 1,
  large: 1.15,
  xl: 1.3,
};

export const TEXT_SIZE_LABEL: Record<ChatTextSize, string> = {
  small: 'Small',
  default: 'Default',
  large: 'Large',
  xl: 'XL',
};

export function useChatDisplay(userId: string | null | undefined) {
  const [display, setDisplay] = useState<ChatDisplay>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    if (!userId) return;
    void (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_PREFIX + userId).catch(() => null);
      if (cancelled || !raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<ChatDisplay>;
        // Merged onto the defaults rather than trusted wholesale: a value
        // written by an older build may be missing keys this one reads, and a
        // stored `textSize` that no longer exists must not survive.
        setDisplay({
          textSize:
            parsed.textSize && parsed.textSize in TEXT_SCALE ? parsed.textSize : DEFAULTS.textSize,
          wallpaper: typeof parsed.wallpaper === 'boolean' ? parsed.wallpaper : DEFAULTS.wallpaper,
        });
      } catch {
        // Corrupt JSON is a preference at its default, not an error to show.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<ChatDisplay>) => {
      setDisplay((prev) => {
        const next = { ...prev, ...patch };
        if (userId) {
          void AsyncStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(next)).catch(() => {});
        }
        return next;
      });
    },
    [userId],
  );

  return { display, update, scale: TEXT_SCALE[display.textSize] };
}
