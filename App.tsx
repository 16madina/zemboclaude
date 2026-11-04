import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from './src/theme';
import { HomeScreen } from './src/screens/HomeScreen';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { BottomNav, type MainTab } from './src/components/BottomNav';
import { CreateSheet } from './src/components/CreateSheet';
import { TableScreen } from './src/table/TableScreen';
import { TableSetupSheet } from './src/table/TableSetupSheet';
import type { TableConfig } from './src/table/data';
import { WorldProvider } from './src/world/store';
import { SessionProvider, useSession } from './src/lib/session';
import { AuthGate } from './src/auth/AuthScreen';
import { WorldRoom } from './src/world/WorldRoom';
import { TalkShowPicker } from './src/talk/TalkShowPicker';
import { SlamTherapie } from './src/talk/SlamTherapie';
import { MicroOuvert } from './src/talk/MicroOuvert';
import type { TalkFormat } from './src/talk/TalkShowPicker';
import { LettresDor } from './src/games/LettresDor';

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <WorldProvider>
          <Main />
          <AuthGate />
        </WorldProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Main() {
  const { requireAuth } = useSession();
  const [tab, setTab] = useState<MainTab>('home');
  const [createOpen, setCreateOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [table, setTable] = useState<TableConfig | null>(null);
  const [inboxBadge, setInboxBadge] = useState(9);
  const [worldOpen, setWorldOpen] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [talk, setTalk] = useState<TalkFormat | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  // un onglet visité reste monté pour garder sa position et son état
  const [visited, setVisited] = useState<Record<string, boolean>>({ home: true });
  const onUnread = useCallback((n: number) => setInboxBadge(n), []);

  // le bouton « + » ouvre le menu de création au lieu de changer d'onglet
  const onTab = (t: MainTab) => {
    if (t === 'create') return requireAuth('Connecte-toi pour lancer un live sur Zembo.', () => setCreateOpen(true));
    setVisited((v) => (v[t] ? v : { ...v, [t]: true }));
    setTab(t);
  };
  const page = (t: MainTab) => [StyleSheet.absoluteFill, { display: tab === t ? ('flex' as const) : ('none' as const) }];

  return (
    <>
      <StatusBar style="light" />
      <View style={styles.root}>
        <View style={styles.content}>
          {/* L'accueil reste monté pour garder la position dans le fil */}
          <HomeScreen focused={tab === 'home' && !createOpen && !setupOpen && !table && !worldOpen && !talkOpen && !talk && !gameOpen} />
          {visited.discover && (
            <View style={page('discover')}>
              <DiscoverScreen />
            </View>
          )}
          <View style={page('inbox')} pointerEvents={tab === 'inbox' ? 'auto' : 'none'}>
            {/* toujours monté pour tenir le badge des messages à jour */}
            <InboxScreen onUnread={onUnread} />
          </View>
          {visited.profile && (
            <View style={page('profile')}>
              <ProfileScreen onStartTable={() => requireAuth('Connecte-toi pour lancer ta Zembo Table.', () => setSetupOpen(true))} />
            </View>
          )}
        </View>
        <BottomNav value={tab} onChange={onTab} inboxBadge={inboxBadge} />
      </View>
      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onPick={(kind) => {
          setCreateOpen(false);
          if (kind === 'world') setTimeout(() => setWorldOpen(true), 250);
          else if (kind === 'talk') setTimeout(() => setTalkOpen(true), 350);
          else if (kind === 'game') setTimeout(() => setGameOpen(true), 350);
          else setTimeout(() => setSetupOpen(true), 350);
        }}
      />
      <TableSetupSheet
        visible={setupOpen}
        onClose={() => setSetupOpen(false)}
        onStart={(c) => {
          setSetupOpen(false);
          setTimeout(() => setTable(c), 300);
        }}
      />
      <TableScreen config={table} onClose={() => setTable(null)} />
      <WorldRoom open={worldOpen} onClose={() => setWorldOpen(false)} />
      <TalkShowPicker
        visible={talkOpen}
        onClose={() => setTalkOpen(false)}
        onPick={(f) => {
          setTalkOpen(false);
          setTimeout(() => setTalk(f), 400);
        }}
      />
      <SlamTherapie open={talk === 'slam'} onClose={() => setTalk(null)} />
      <MicroOuvert open={talk === 'open-mic'} onClose={() => setTalk(null)} />
      <LettresDor open={gameOpen} onClose={() => setGameOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
