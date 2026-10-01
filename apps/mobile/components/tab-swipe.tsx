/**
 * Swipe between tabs, like Instagram: swipe left for the next tab, right for
 * the previous one. Paired with the tabs' `shift` scene animation, so the new
 * screen slides in from the side you swiped toward.
 *
 * It is a fling, not a page you drag with your finger — a live-dragging pager
 * needs react-native-pager-view, a native module this binary doesn't have.
 *
 * Conflicts are settled by thresholds and by who activates first:
 *  - Vertical scrolling fails this gesture after 14pt of vertical travel, so
 *    the page scroll is never stolen.
 *  - Horizontal rails (chips, campaign cards, the pipeline strip) use the
 *    gesture-handler ScrollView, which activates on the first few points of
 *    movement — well before this needs 28pt — so a rail keeps its own drags.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export const TAB_ORDER = ['home', 'campaigns', 'requests', 'messages', 'projects'] as const;

export function TabSwipe({
  routeName,
  onNavigate,
  children,
}: {
  routeName: string;
  onNavigate: (name: string) => void;
  children: ReactNode;
}) {
  const go = (dir: 1 | -1) => {
    const i = TAB_ORDER.indexOf(routeName as (typeof TAB_ORDER)[number]);
    const next = TAB_ORDER[i + dir];
    if (i < 0 || !next) return;
    void Haptics.selectionAsync();
    onNavigate(next);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-28, 28])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > 80;
      const fast = Math.abs(e.velocityX) > 650;
      if (far || fast) runOnJS(go)(e.translationX < 0 ? 1 : -1);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>
    </GestureDetector>
  );
}
