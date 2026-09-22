/**
 * The explanation shown BEFORE the OS notification prompt (see lib/push-prompt.ts
 * for why). Rendered once from the root layout; visible only after a meaningful
 * action called maybeAskForPush(). "Turn on notifications" triggers the real OS
 * prompt; "Not now" is remembered so we do not nag.
 */
import { Modal, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { pushPromptLead } from '@influnet/core';
import { useTheme } from '@/lib/theme';
import { Button, Card, Txt } from '@/components/ui';
import { acceptPushPrompt, dismissPushPrompt, usePushPromptStore } from '@/lib/push-prompt';

export function PushPrompt() {
  const t = useTheme();
  const moment = usePushPromptStore((s) => s.moment);

  return (
    <Modal visible={!!moment} transparent animationType="fade" onRequestClose={() => void dismissPushPrompt()}>
      {moment ? (
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 }}>
          <Card style={{ gap: t.spacing.md }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: t.color.brandSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bell size={22} color={t.color.brand} />
            </View>
            <Txt variant="title2">Know when it&rsquo;s your move</Txt>
            <Txt variant="body" tone="soft">
              {pushPromptLead(moment)}
            </Txt>
            <Txt variant="footnote" tone="muted">
              Only things that need you: replies, requests and project steps. You can change this any time in Settings.
            </Txt>
            <View style={{ gap: 8, marginTop: t.spacing.xs }}>
              <Button label="Turn on notifications" onPress={() => void acceptPushPrompt()} />
              <Button label="Not now" variant="ghost" onPress={() => void dismissPushPrompt()} />
            </View>
          </Card>
        </View>
      ) : null}
    </Modal>
  );
}
