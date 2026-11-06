import { useCallback, useEffect, useState } from 'react';
import { setAudioModeAsync } from 'expo-audio';
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
import { MotDor } from './src/games/MotDor';
import { PublishScreen } from './src/post/PublishScreen';
import type { MediaKind } from './src/post/posts';


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
  // les sons (musiques, sons repris) jouent aussi quand l'iPhone est en mode silencieux
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);
  const [tab, setTab] = useState<MainTab>('home');
  const [createOpen, setCreateOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [table, setTable] = useState<TableConfig | null>(null);
  const [inboxBadge, setInboxBadge] = useState(9);
  const [worldOpen, setWorldOpen] = useState(false);
  const [talkOpen, setTalkOpen] = useState(false);
  const [talk, setTalk] = useState<TalkFormat | null>(null);
  const [gameOpen, setGameOpen] = useState(false);
  const [motOpen, setMotOpen] = useState(false);
  const [publish, setPublish] = useState<MediaKind | null>(null);
  const [homeTop, setHomeTop] = useState(0);
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
          <HomeScreen
            focused={tab === 'home' && !createOpen && !setupOpen && !table && !worldOpen && !talkOpen && !talk && !gameOpen && !motOpen && !publish}
            jumpTop={homeTop}
          />
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
              <ProfileScreen
                onStartTable={() => requireAuth('Connecte-toi pour lancer ta Zembo Table.', () => setSetupOpen(true))}
                onPublish={() => requireAuth('Connecte-toi pour publier sur Zembo.', () => setPublish('video'))}
              />
            </View>
          )}
        </View>
        <BottomNav value={tab} onChange={onTab} inboxBadge={inboxBadge} />
      </View>
      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onPublish={(k) => {
          setCreateOpen(false);
          setTimeout(() => setPublish(k), 350);
        }}
        onPick={(kind) => {
          setCreateOpen(false);
          if (kind === 'world') setTimeout(() => setWorldOpen(true), 250);
          else if (kind === 'talk') setTimeout(() => setTalkOpen(true), 350);
          else if (kind === 'game') setTimeout(() => setGameOpen(true), 350);
          else if (kind === 'motdor') setTimeout(() => setMotOpen(true), 350);
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
      <MotDor open={motOpen} onClose={() => setMotOpen(false)} />
      <PublishScreen
        kind={publish}
        onClose={() => setPublish(null)}
        onPublished={() => {
          setPublish(null);
          // retour sur l'accueil, tout en haut : la nouvelle publication est la première
          setVisited((v) => ({ ...v, home: true }));
          setTab('home');
          setHomeTop((n) => n + 1);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
