/**
 * Shown to the creator on a finished project: the natural moment to put the
 * work in their portfolio. A card, plus a one-time ask the first time they
 * open the finished project, so it is offered rather than hoped for.
 */
import { useEffect } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { Button, Card, Txt } from '@/components/ui';

export function PortfolioPrompt({
  projectId,
  title,
  brand,
}: {
  projectId: string;
  title: string;
  brand: string;
}) {
  const t = useTheme();
  const router = useRouter();

  const open = () =>
    router.push({ pathname: '/portfolio/add', params: { title, brand } });

  useEffect(() => {
    const key = `portfolio-asked:${projectId}`;
    (async () => {
      try {
        if (await AsyncStorage.getItem(key)) return;
        await AsyncStorage.setItem(key, '1');
      } catch {
        return;
      }
      Alert.alert(
        'Add this to your portfolio?',
        `“${title}” is finished. Showing it on your profile helps the next brand trust you.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Add it', onPress: open },
        ],
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <Card style={{ gap: t.spacing.sm, backgroundColor: t.color.brandSoft, borderColor: t.color.brand + '30' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <Sparkles size={18} color={t.color.brand} />
        <Txt variant="bodyStrong">Show this work off</Txt>
      </View>
      <Txt variant="footnote" tone="soft">
        Add the finished content to your portfolio — paste a link to the post or video and it appears on your public profile.
      </Txt>
      <Button label="Add to portfolio" onPress={open} />
    </Card>
  );
}
