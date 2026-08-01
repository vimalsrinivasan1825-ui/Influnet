/**
 * Catches render errors anywhere below it and shows a recoverable screen
 * instead of the white/red screen of death.
 *
 * Why a class: React error boundaries have no hooks equivalent —
 * `componentDidCatch` / `getDerivedStateFromError` only exist on classes. This
 * is the one place in the app where that is still true.
 *
 * The reset path deliberately re-renders children rather than reloading the
 * bundle. A reload would drop the user back at the entry gate and lose their
 * place; most render errors are a single bad screen, not a poisoned app.
 */
import { Component, type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { Txt } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { captureException } from '@/lib/analytics';
import { logger } from '@/lib/logger';
import { palette, spacing } from '@influnet/tokens';

interface Props {
  children: ReactNode;
  /** Shown above the message — e.g. the screen name that failed. */
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Local log first — it is the only signal in development, where no DSN is
    // configured and captureException is a no-op.
    logger.error('render error caught by boundary', { err: error });
    captureException(error, {
      kind: 'react-error-boundary',
      label: this.props.label ?? null,
      componentStack: info.componentStack ?? null,
    });
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.wrap}>
        <Txt variant="title2" center>
          This screen ran into a problem
        </Txt>
        <Txt variant="body" tone="muted" center style={styles.body}>
          It has been reported. You can try again, and the rest of the app keeps
          working.
        </Txt>
        <Button label="Try again" onPress={this.reset} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: palette.surface,
  },
  body: { marginBottom: spacing.sm },
});
