import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { LIVE_CAPTIONS } from './slamData';

// Mode Paroles (maquette) :
// - avec un texte préparé : affichage façon karaoké, les mots s'allument au fil du passage ;
// - sans texte : sous-titres en direct (ce que dit la personne, mot par mot).
// Ici la progression est simulée avec le chrono. Avec la vraie reconnaissance vocale,
// la position viendra de ce que la personne prononce réellement.

const GOLD = '#F3D27A';

export function LyricsPanel({ lyrics, elapsed, total, running, slotKey }: { lyrics?: string; elapsed: number; total: number; running: boolean; slotKey: number }) {
  const [hidden, setHidden] = useState(false);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable onPress={() => setHidden((h) => !h)} style={styles.mode} hitSlop={8}>
        <View style={[styles.dot, { backgroundColor: lyrics ? GOLD : '#FF5A6E' }]} />
        <Text style={styles.modeText}>{lyrics ? 'PAROLES · TEXTE PRÉPARÉ' : 'SOUS-TITRES EN DIRECT'}</Text>
        <Text style={styles.modeHide}>{hidden ? 'Afficher' : 'Masquer'}</Text>
      </Pressable>
      {!hidden && (lyrics ? <Karaoke key={slotKey} lyrics={lyrics} elapsed={elapsed} total={total} /> : <LiveCaptions key={slotKey} running={running} />)}
    </View>
  );
}

function Karaoke({ lyrics, elapsed, total }: { lyrics: string; elapsed: number; total: number }) {
  const lines = useMemo(() => lyrics.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/)), [lyrics]);
  const count = useMemo(() => lines.reduce((a, l) => a + l.length, 0), [lines]);

  // position dans le texte (simulée : le texte se déroule sur ~90 % du temps de passage)
  const spoken = Math.min(count, Math.floor((elapsed / Math.max(1, total * 0.9)) * count));
  let line = 0;
  let before = 0;
  while (line < lines.length - 1 && before + lines[line].length <= spoken) {
    before += lines[line].length;
    line += 1;
  }
  const inLine = spoken - before;
  const done = spoken >= count;

  // petit glissement à chaque nouvelle ligne
  const slide = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [line, slide]);

  return (
    <Animated.View style={{ opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      {line > 0 && <Text style={styles.prev}>{lines[line - 1].join(' ')}</Text>}
      <Text style={styles.current}>
        {lines[line].map((w, i) => (
          <Text key={i} style={done || i < inLine ? styles.on : i === inLine ? styles.now : styles.off}>
            {w}
            {i < lines[line].length - 1 ? ' ' : ''}
          </Text>
        ))}
      </Text>
      {line < lines.length - 1 && <Text style={styles.next}>{lines[line + 1].join(' ')}</Text>}
      <View style={styles.progress}>
        <View style={[styles.fill, { width: `${(spoken / count) * 100}%` }]} />
      </View>
    </Animated.View>
  );
}

function LiveCaptions({ running }: { running: boolean }) {
  // les mots arrivent un par un, comme une transcription en direct
  const words = useMemo(() => LIVE_CAPTIONS.join(' / ').split(' '), []);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setN((x) => (x + 1) % (words.length + 6)), 380);
    return () => clearInterval(t);
  }, [running, words.length]);
  const shown = words.slice(0, Math.min(n, words.length)).join(' ');
  const parts = shown.split(' / ');
  const current = parts[parts.length - 1] ?? '';
  const previous = parts.length > 1 ? parts[parts.length - 2] : '';
  return (
    <View>
      {!!previous && <Text style={styles.prev}>{previous}</Text>}
      <Text style={[styles.current, { color: colors.white }]}>
        {current}
        <Text style={styles.cursor}> ▍</Text>
      </Text>
      <Text style={styles.captionNote}>Transcription automatique · peut contenir des erreurs</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 14,
    paddingTop: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(243,210,122,0.25)',
  },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  modeText: { flex: 1, color: 'rgba(255,255,255,0.75)', fontSize: 9.5, fontWeight: '900', letterSpacing: 1.2 },
  modeHide: { color: GOLD, fontSize: 11, fontWeight: '800' },
  prev: { color: 'rgba(255,255,255,0.38)', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  current: { fontSize: 23, fontWeight: '900', lineHeight: 30, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 6 },
  on: { color: GOLD },
  now: { color: colors.white, textDecorationLine: 'underline', textDecorationColor: GOLD },
  off: { color: 'rgba(255,255,255,0.55)' },
  next: { color: 'rgba(255,255,255,0.45)', fontSize: 15, fontWeight: '700', marginTop: 8 },
  progress: { height: 2.5, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 12, overflow: 'hidden' },
  fill: { height: 2.5, backgroundColor: GOLD },
  cursor: { color: '#FF5A6E' },
  captionNote: { color: 'rgba(255,255,255,0.4)', fontSize: 10.5, marginTop: 8 },
});
