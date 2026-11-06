import { Modal, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DemoTableRoom } from '../table/TableScreen';
import { MicroLive } from '../talk/MicroOuvert';
import { SlamLive } from '../talk/SlamTherapie';
import { LettresDor } from '../games/LettresDor';
import { MotDor } from '../games/MotDor';
import type { OnAirLive } from './onair';

// Ouvre la démonstration d'un live d'exemple de l'accueil (participants simulés, rien n'est diffusé)
export function DemoLive({ live, onClose }: { live: OnAirLive | null; onClose: () => void }) {
  return (
    <Modal visible={!!live} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {live?.format === 'table' && <DemoTableRoom config={{ title: live.title, capacity: 6 }} onClose={onClose} />}
          {live?.format === 'slam' && <SlamLive onClose={onClose} />}
          {live?.format === 'openmic' && <MicroLive onClose={onClose} />}
          {live?.format === 'lettres' && <LettresDor open preview onClose={onClose} />}
          {live?.format === 'motdor' && <MotDor open preview onClose={onClose} />}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
