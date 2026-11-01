import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { useWorld } from './store';
import { WorldIntro, WorldOnboarding } from './Onboarding';
import { WorldDiscover } from './Discover';
import { HelloFlow, type HelloStep } from './HelloFlow';
import { WorldHellos, WorldMessages, WorldMyProfile, WorldThread } from './Tabs';
import { WorldDock, WorldToast, worldBg, type WorldTab } from './ui';

// World Room : un espace à part dans Zembo, avec sa propre barre d'onglets
export function WorldRoom({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const y = useRef(new Animated.Value(height)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(y, {
      toValue: open ? 0 : height,
      duration: open ? 380 : 280,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => finished && !open && setMounted(false));
  }, [open, height, y]);

  if (!mounted) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.layer, { transform: [{ translateY: y }] }]}>
      <Room onClose={onClose} />
    </Animated.View>
  );
}

function Room({ onClose }: { onClose: () => void }) {
  const w = useWorld();
  if (!w.loaded)
    return (
      <View style={[styles.fill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 34 }}>🌍</Text>
        <ActivityIndicator color={colors.gold} style={{ marginTop: 14 }} />
      </View>
    );
  return <RoomReady onClose={onClose} />;
}

function RoomReady({ onClose }: { onClose: () => void }) {
  const w = useWorld();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<'intro' | 'onboarding' | 'main'>(w.profile.completed ? 'main' : 'intro');
  const [startStep, setStartStep] = useState(1);
  const [tab, setTab] = useState<WorldTab>('discover');
  const [hello, setHello] = useState<{ id: string; step: HelloStep } | null>(null);
  const [thread, setThread] = useState<string | null>(null);

  if (screen === 'intro')
    return (
      <View style={styles.fill}>
        <WorldIntro
          onBack={onClose}
          onStart={() => {
            setStartStep(1);
            setScreen('onboarding');
          }}
        />
        <WorldToast />
      </View>
    );

  if (screen === 'onboarding')
    return (
      <View style={styles.fill}>
        <WorldOnboarding
          key={startStep}
          start={startStep}
          onExit={() => setScreen(w.profile.completed ? 'main' : 'intro')}
          onDone={() => setScreen('main')}
        />
        <WorldToast />
      </View>
    );

  const unreadMsgs = w.connections.reduce((a, c) => a + (w.unread[c.id] ?? 0), 0);
  const edit = (step: number) => {
    setStartStep(step);
    setScreen('onboarding');
  };

  return (
    <View style={styles.fill}>
      <View style={{ flex: 1 }}>
        {tab === 'discover' && (
          <WorldDiscover
            onMatch={(p) => setHello({ id: p.id, step: 'celebration' })}
            onResetProfile={() => {
              w.resetProfile();
              setScreen('intro');
            }}
          />
        )}
        {tab === 'hellos' && <WorldHellos onOpen={(id, step) => setHello({ id, step })} />}
        {tab === 'messages' && <WorldMessages onThread={setThread} onHellos={() => setTab('hellos')} />}
        {tab === 'profile' && (
          <WorldMyProfile
            onEdit={edit}
            onMessages={() => setTab('messages')}
            onQuit={() => {
              w.resetProfile();
              w.showToast('Profil World Room désactivé');
              setScreen('intro');
            }}
          />
        )}
      </View>
      <WorldDock value={tab} onChange={setTab} badges={{ hellos: w.pending.length, messages: unreadMsgs }} />

      {/* sortir de World Room → retour à Zembo */}
      {tab !== 'discover' && (
        <Pressable onPress={onClose} hitSlop={10} style={[styles.exit, { top: insets.top + 12 }]}>
          <Ionicons name="close" size={18} color={colors.text} />
        </Pressable>
      )}
      {tab === 'discover' && (
        <Pressable onPress={onClose} hitSlop={10} style={[styles.exitDiscover, { top: insets.top + 70 }]}>
          <Ionicons name="chevron-down" size={14} color={colors.text} />
          <Text style={styles.exitText}>Zembo</Text>
        </Pressable>
      )}

      {thread && (
        <View style={StyleSheet.absoluteFill}>
          <WorldThread id={thread} onBack={() => setThread(null)} />
        </View>
      )}
      {hello && (
        <HelloFlow
          key={`${hello.id}-${hello.step}`}
          personId={hello.id}
          initial={hello.step}
          onClose={() => setHello(null)}
          onOpenThread={(id) => {
            setHello(null);
            setTab('messages');
            setThread(id);
          }}
        />
      )}
      <WorldToast />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 60, backgroundColor: worldBg },
  fill: { flex: 1, backgroundColor: worldBg },
  exit: {
    position: 'absolute',
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitDiscover: {
    position: 'absolute',
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  exitText: { color: colors.text, fontSize: 11, fontWeight: '700' },
});
