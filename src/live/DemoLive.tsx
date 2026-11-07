import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DemoTableRoom } from '../table/TableScreen';
import { MicroLive } from '../talk/MicroOuvert';
import { SlamLive } from '../talk/SlamTherapie';
import { LettresDor } from '../games/LettresDor';
import { MotDor } from '../games/MotDor';
import type { OnAirLive } from './onair';

// Lives d'exemple de l'accueil : leur démonstration (participants simulés, rien n'est diffusé).

const noop = () => {};

/** La scène du live d'exemple. `quiet` : aperçu dans le fil (sans son, sans vibration, sans animation d'entrée) */
function DemoScene({ live, onClose, quiet }: { live: OnAirLive; onClose: () => void; quiet?: boolean }) {
  switch (live.format) {
    case 'table':
      return <DemoTableRoom config={{ title: live.title, capacity: 6 }} host={{ name: live.name || live.pseudo, photo: live.face }} onClose={onClose} />;
    case 'slam':
      return <SlamLive onClose={onClose} quiet={quiet} />;
    case 'openmic':
      return <MicroLive onClose={onClose} />;
    case 'lettres':
      return <LettresDor open preview quiet={quiet} onClose={onClose} />;
    case 'motdor':
      return <MotDor open preview quiet={quiet} onClose={onClose} />;
  }
}

/** Ouvre le live d'exemple en plein écran */
export function DemoLive({ live, onClose }: { live: OnAirLive | null; onClose: () => void }) {
  return (
    <Modal visible={!!live} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#000' }}>{live && <DemoScene live={live} onClose={onClose} />}</View>
      </SafeAreaProvider>
    </Modal>
  );
}

/**
 * Ce qui se passe dans le live, en direct dans la carte du fil (comme sur TikTok).
 * On ne peut pas y toucher : toucher la carte ouvre le live. La scène est décalée sous les onglets du haut.
 */
export function DemoPreview({ live }: { live: OnAirLive }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <SafeAreaInsetsContext.Provider value={{ ...insets, top: insets.top + 46, bottom: 0 }}>
        <DemoScene live={live} onClose={noop} quiet />
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
