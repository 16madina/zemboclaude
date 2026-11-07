import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';

// Animation d'ouverture de Zembo : le logo doré s'anime (2 s), puis s'efface en fondu vers l'accueil.
// La première image est posée dessous pour qu'il n'y ait jamais d'écran noir avant la vidéo.

const VIDEO = require('../../assets/splash/zembo-splash.mp4');
const FIRST = require('../../assets/splash/zembo-splash-first.jpg');
const MAX_MS = 4000; // filet de sécurité si la vidéo ne se lance pas

export function SplashVideo({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  const done = useRef(false);
  const player = useVideoPlayer(VIDEO, (p) => {
    p.muted = true;
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      Animated.timing(opacity, { toValue: 0, duration: 380, useNativeDriver: true }).start(() => onDone());
    };
    const sub = player.addListener('playToEnd', finish);
    const t = setTimeout(finish, MAX_MS);
    return () => {
      sub.remove();
      clearTimeout(t);
    };
  }, [player, opacity, onDone]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity }]} pointerEvents="none">
      <Image source={FIRST} style={StyleSheet.absoluteFill} contentFit="contain" />
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000', zIndex: 1000 },
});
