/**
 * The app-wide error boundary (review #43, 21 Nov 2026).
 *
 * Without one, a render error anywhere in the tree unmounted everything: a blank screen in a
 * release build, nothing for the customer to do but kill the app, and nothing sent to us. Now they
 * get a plain "Something went wrong" with a Reload button, and the error goes to Sentry through
 * lib/sentry (inert without a DSN, and it strips personal data before anything is sent).
 *
 * Deliberately plain: no store, no custom fonts, no theme hooks — any of those could be the thing
 * that broke. Only static colour tokens.
 */
import React from 'react';
import { DevSettings, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@f2f/tokens';
import { reportError } from '../lib/sentry';
import { reloadApp } from '../lib/reloadApp';

function loadUpdates() {
  // Lazy, like lib/sentry: a top-level import of a native module throws on a binary without it.
  try {
    return require('expo-updates');
  } catch {
    return null;
  }
}

/** @extends {React.Component<{ children?: any }, { error: any }>} */
export class AppErrorBoundary extends React.Component {
  /** @param {{ children?: any }} props */
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reload = this.reload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    reportError(error, { boundary: 'root' });
  }

  reload() {
    reloadApp({
      updates: loadUpdates(),
      devSettings: DevSettings,
      isDev: __DEV__,
      reset: () => this.setState({ error: null }),
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.wrap} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>Sorry, the app hit a problem. Reload to carry on.</Text>
        <Pressable onPress={this.reload} accessibilityRole="button" hitSlop={12} style={styles.btn}>
          <Text style={styles.btnText}>Reload</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    backgroundColor: colors.canvas,
  },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  body: { color: colors.ink3, fontSize: 15, textAlign: 'center' },
  btn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.night,
  },
  btnText: { color: colors.inkOnDark, fontSize: 16, fontWeight: '600' },
});
