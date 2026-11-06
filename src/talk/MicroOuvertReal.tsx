import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import {
  ChatInput,
  GiftGrid,
  LiveBadge,
  LiveChat,
  OptionRow,
  Pill,
  ShareRow,
  Sheet,
  SideAction,
  TINTS,
  Toast,
  liveStyles as L,
  tap,
  useFloaters,
  useToast,
  type LiveMsg,
} from './LiveKit';
import { BarItem, GIFTS, Hand, REACTIONS, SUBJECT, Wave, clock, microStyles as styles } from './MicroOuvert';
import { useSession } from '../lib/session';
import { auth } from '../lib/firebase';
import { CameraFeed, useLiveMedia } from '../live/media';
import { Initial } from '../live/LiveViewer';
import { roomOf, sendLiveMessage, useHostOnAir, useLiveChatFeed, useOnAirLive, useWatching, type OnAirLive } from '../live/onair';
import { useStage } from '../live/stage';
import { setFollow, useFollows } from '../post/social';

// Micro Ouvert en vrai : l'hôte anime, jusqu'à 4 vraies personnes montent sur scène avec leur caméra.
// Les invités arrivent micro coupé ; ils lèvent la main et l'hôte leur donne la parole.

type Role = 'host' | 'guest' | 'viewer';
const ROLE_LABEL: Record<Role, string> = { host: '👑 Hôte', guest: '🙋 Invité', viewer: '👁 Spectateur' };

/** Entrer comme spectateur dans le Micro Ouvert d'un autre membre (depuis l'accueil) */
export function MicroViewer({ live, onClose }: { live: OnAirLive | null; onClose: () => void }) {
  return (
    <Modal visible={!!live} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{live && <MicroReal key={live.room} hostRoom={live.room} start={live} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

export function MicroReal({ onClose, hostRoom, start }: { onClose: () => void; hostRoom?: string; start?: OnAirLive }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const T = insets.top;
  const fly = useFloaters();
  const toast = useToast();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const { profile } = useSession();
  const me = auth.currentUser?.uid ?? '';
  const pseudo = profile?.pseudo ?? '';
  const isHost = !hostRoom;
  const room = hostRoom ?? (me ? roomOf('openmic', me) : null);

  // ── la scène partagée : 4 places, demandes, mains levées, micros ──
  const stage = useStage(room, { host: isHost, slots: 4, pseudo, capacity: 5 });
  const hostAir = useHostOnAir('openmic', { active: isHost, title: SUBJECT, pseudo, name: [profile?.prenom, profile?.nom].filter(Boolean).join(' ') });
  useWatching(isHost ? null : room);
  const air = useOnAirLive(room);
  const ended = !isHost && air === null;
  const subject = (isHost ? SUBJECT : air?.title || start?.title) ?? SUBJECT;
  const role: Role = stage.role === 'host' ? 'host' : stage.role === 'stage' ? 'guest' : 'viewer';
  const riseAsked = stage.role === 'requested';
  const mutedByHost = stage.muted.includes(me);

  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const media = useLiveMedia(room, { publish: role !== 'viewer', camera: camOn, mic: micOn && !mutedByHost, name: pseudo });
  const speakers = media.speakers();
  const following = useFollows(me, stage.hostUid);

  const hostName = stage.names[stage.hostUid] || air?.pseudo || start?.pseudo || 'Hôte';
  const hostCam = role === 'host' ? media.cameraOf('me') : media.cameraOf(stage.hostUid);
  const guests = stage.stage.map((uid, i) => ({
    slot: i + 1,
    uid,
    name: uid ? stage.names[uid] || 'Invité' : null,
    mic: !!uid && !stage.muted.includes(uid) && !(uid === me && !micOn),
    hand: !!uid && stage.hands.includes(uid),
    speaking: !!uid && (uid === me ? speakers.has('me') : speakers.has(uid)),
    me: !!uid && uid === me,
  }));
  const hands = guests.filter((g) => g.name && g.hand);
  const freeSlots = guests.filter((g) => !g.name).length;
  const myHand = stage.hands.includes(me);

  // chrono du live : depuis le début (côté serveur)
  const [nowMs, setNowMs] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = air?.startedAt ? Math.max(0, Math.floor((nowMs - air.startedAt) / 1000)) : 0;

  // ── chat réel ──
  const feed = useLiveChatFeed(room, 30);
  const msgs: LiveMsg[] = useMemo(
    () => feed.map((m, i) => ({ id: m.id, user: m.pseudo, text: m.text, tint: m.uid === me ? colors.gold : TINTS[(i + 1) % TINTS.length], me: m.uid === me, real: true })),
    [feed, me],
  );
  const send = (t: string) => {
    if (room && pseudo) sendLiveMessage(room, pseudo, t).catch(() => {});
  };

  // les annonces (arrivées sur scène) en message éphémère
  const prev = useRef<string[] | null>(null);
  useEffect(() => {
    const cur = stage.stage.filter(Boolean);
    const before = prev.current;
    prev.current = cur;
    if (!before) return;
    const up = cur.find((u) => !before.includes(u));
    if (up) toast.show(up === me ? 'Tu es sur scène 🎤 Lève la main pour parler' : `${stage.names[up] || 'Un invité'} monte sur scène 🎤`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.stage]);

  const [sheet, setSheet] = useState<'requests' | 'invite' | 'react' | 'gifts' | 'more' | 'places' | 'rise' | null>(null);
  const close = () => setSheet(null);
  const run = (p: Promise<unknown>) => void p.catch(() => toast.show('Action impossible pour le moment'));

  const toggleMyHand = () => {
    run(stage.raiseHand(!myHand));
    toast.show(!myHand ? 'Ta main est levée ✋' : 'Demande annulée');
  };
  const giveFloor = (uid: string, name: string | null) => {
    if (stage.muted.includes(uid)) run(stage.toggleMute(uid));
    run(stage.lowerHand(uid));
    toast.show(`${name ?? 'L’invité'} a la parole 🎤`);
  };
  const refuse = (uid: string) => run(stage.lowerHand(uid));
  const kick = (uid: string, name: string | null) => {
    run(stage.remove(uid));
    run(stage.lowerHand(uid));
    toast.show(`${name} est redescendu·e`);
  };
  const askRise = () => {
    run(stage.request(pseudo));
    toast.show("Demande envoyée ⏳ En attente de l'hôte");
  };
  const promote = (uid: string, name: string) => {
    if (!freeSlots) return toast.show("Scène pleine — libère une place d'abord");
    // les invités arrivent micro coupé : ils lèvent la main pour parler
    run(stage.accept(uid, name, { muted: true }));
  };
  const leaveStage = () => {
    run(stage.leave());
    if (myHand) run(stage.raiseHand(false));
    toast.show('Tu es redescendu·e 👁 Spectateur');
  };

  const moreItems =
    role === 'host'
      ? [
          { emoji: '🙋', title: 'Gérer les places', sub: `4 places max · ${freeSlots} libre(s)`, action: () => setSheet('places') },
          { emoji: '✋', title: 'Demandes de montée', sub: 'Spectateurs qui veulent une place', badge: stage.requests.length, action: () => setSheet('rise') },
          { emoji: '🚫', title: 'Modération / Signaler', sub: 'Gérer un comportement inapproprié', action: () => toast.show('Signalement transmis') },
          { emoji: '📄', title: 'Règles', sub: 'Respect • Pas de jugement • Bonne vibe ✨', action: () => toast.show('Règles du live affichées') },
          { emoji: '⏹', title: 'Terminer le live', sub: 'Fermer le Micro Ouvert pour tout le monde', action: onClose, danger: true },
        ]
      : role === 'guest'
        ? [
            { emoji: '↗', title: 'Partager', sub: 'Inviter des amis à écouter', action: () => setSheet('invite') },
            { emoji: '🚪', title: 'Quitter la scène', sub: 'Redevenir spectateur et libérer ta place', action: leaveStage },
            { emoji: '🚫', title: 'Signaler', sub: 'Signaler un comportement inapproprié', action: () => toast.show('Signalement transmis') },
            { emoji: '📄', title: 'Règles', sub: 'Respect • Pas de jugement • Bonne vibe ✨', action: () => toast.show('Règles du live affichées') },
          ]
        : [
            { emoji: '↗', title: 'Partager', sub: 'Inviter des amis à écouter', action: () => setSheet('invite') },
            { emoji: '🚫', title: 'Signaler le live', sub: 'Prévenir la modération Zembo', action: () => toast.show('Signalement transmis') },
            { emoji: '📄', title: 'Règles de la communauté', sub: 'Respect • Pas de jugement • Bonne vibe ✨', action: () => toast.show('Règles affichées') },
            { emoji: '🚪', title: 'Quitter', sub: 'Sortir du live', action: onClose, danger: true },
          ];

  const stageH = Math.round(width * 0.82);
  const tileW = (width - 12 * 2 - 6 * 3) / 4;
  const status =
    media.status === 'error' ? 'Connexion à la vidéo impossible pour le moment.' : media.status === 'connecting' ? 'Connexion au live…' : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#07050A' }}>
      <LinearGradient colors={['#1C120A', '#07050A']} style={StyleSheet.absoluteFill} />
      {/* scène de l'hôte : sa caméra en direct */}
      <View style={{ position: 'absolute', top: T + 88, left: 0, right: 0, height: stageH, backgroundColor: '#0D0906' }}>
        {hostCam ? (
          <CameraFeed trackRef={hostCam} mirror={role === 'host'} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 10 }]}>
            <Initial name={hostName} size={96} />
            <Text style={{ color: colors.textDim, fontSize: 13, fontWeight: '600' }}>
              {status ?? (role === 'host' ? (camOn ? 'Ta caméra s’allume…' : 'Ta caméra est coupée') : `${hostName} n’a pas encore allumé sa caméra`)}
            </Text>
          </View>
        )}
        <LinearGradient colors={['rgba(8,5,12,0.6)', 'transparent', 'transparent', 'rgba(8,5,12,0.85)']} locations={[0, 0.2, 0.7, 1]} style={StyleSheet.absoluteFill} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={(e) => {
            tap();
            fly.add('❤️', e.nativeEvent.locationX, e.nativeEvent.locationY + T + 88);
          }}
        />
        {/* pastille hôte */}
        <View style={styles.hostChip} pointerEvents="box-none">
          <Initial name={hostName} size={30} />
          <View>
            <Text style={styles.hostName}>{hostName} 👑</Text>
            <Text style={styles.hostRole}>Hôte</Text>
          </View>
          {role !== 'host' && !!me && (
            <Pressable
              onPress={() => {
                tap();
                setFollow(me, stage.hostUid, !following).catch(() => {});
              }}
              style={[following ? L.followOn : L.followOff, { marginLeft: 2 }]}
            >
              <Text style={following ? L.followTextOn : L.followTextOff}>{following ? 'Suivi ✓' : '+ Suivre'}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.liveRow} pointerEvents="none">
          <LiveBadge />
          <Text style={styles.clock}>{clock(seconds)}</Text>
        </View>
      </View>

      {/* en-tête */}
      <View style={[styles.head, { top: T + 4 }]}>
        <LinearGradient colors={goldGradient} style={styles.z}>
          <Text style={styles.zText}>Z</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>MICRO OUVERT</Text>
          <Text style={styles.subject} numberOfLines={2}>
            Sujet : {subject}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pill>
              <Ionicons name="eye" size={11} color={colors.text} />
              <Text style={L.pillText}>{isHost ? hostAir.viewers : (air?.viewers ?? 0)}</Text>
            </Pill>
            <Pressable onPress={() => setSheet('more')} style={L.round} hitSlop={6}>
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.text} />
            </Pressable>
            <Pressable onPress={onClose} style={L.round} hitSlop={6}>
              <Ionicons name="close" size={17} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.roleChip}>
            <Text style={styles.roleText}>{ROLE_LABEL[role]}</Text>
          </View>
        </View>
      </View>

      {/* 4 places invités */}
      <View style={[styles.guests, { top: T + 88 + stageH - 64 }]}>
        {guests.map((g) => {
          if (!g.name)
            return (
              <Pressable
                key={g.slot}
                onPress={() => {
                  tap();
                  if (role === 'viewer' && !riseAsked) askRise();
                  else if (role === 'host') setSheet('rise');
                }}
                style={[styles.tile, styles.tileEmpty, { width: tileW }]}
              >
                <Text style={styles.plus}>+</Text>
                <Text style={styles.emptyText}>{role === 'viewer' ? (riseAsked ? 'En attente…' : 'Demander à monter') : 'Place libre'}</Text>
              </Pressable>
            );
          const cam = g.me ? media.cameraOf('me') : media.cameraOf(g.uid);
          return (
            <Pressable
              key={g.slot}
              onPress={() => {
                tap();
                if (role === 'host') {
                  if (g.hand) giveFloor(g.uid, g.name);
                  else run(stage.toggleMute(g.uid)); // couper / rendre la parole
                } else if (g.me) toggleMyHand();
              }}
              style={[styles.tile, { width: tileW }, g.hand ? styles.tileHand : g.speaking && g.mic ? styles.tileSpeak : null]}
            >
              {cam ? (
                <CameraFeed trackRef={cam} mirror={g.me} style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
                  <Initial name={g.name} size={44} />
                </View>
              )}
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={[StyleSheet.absoluteFill, { top: '45%' }]} />
              <View style={styles.slotNum}>
                <Text style={styles.slotNumText}>{g.slot}</Text>
              </View>
              {g.hand && <Hand />}
              <View style={styles.tileFoot}>
                <Ionicons name={g.mic ? 'mic' : 'mic-off'} size={10} color={g.mic ? colors.gold : '#F07167'} />
                <Text style={styles.tileName} numberOfLines={1}>
                  {g.me ? 'Toi' : g.name}
                </Text>
              </View>
              {g.mic && g.speaking && (
                <View style={styles.wave}>
                  <Wave />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* colonne droite */}
      <View style={[styles.actions, { top: T + 96 }]}>
        <SideAction icon="arrow-redo" label="Partager" onPress={() => setSheet('invite')} />
        {role === 'viewer' && (
          <SideAction
            icon="hand-right"
            accent={riseAsked ? '#5A5146' : '#2EC4A6'}
            label={riseAsked ? 'Annuler' : 'Monter'}
            onPress={() => {
              if (riseAsked) {
                run(stage.cancelRequest());
                toast.show('Demande annulée');
              } else askRise();
            }}
          />
        )}
        {role === 'guest' && <SideAction icon="hand-right" accent={myHand ? colors.gold : '#2EC4A6'} label={myHand ? 'Main levée' : 'Parler'} onPress={toggleMyHand} />}
        <SideAction icon="Z" label="Zems" gold onPress={() => setSheet('gifts')} />
      </View>

      {/* chat + saisie + barre du bas */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom} pointerEvents="box-none">
        <LiveChat msgs={msgs} max={5} />
        <ChatInput ref={input} onSend={send} />
        {role !== 'viewer' && (
          <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 18, 6) }]}>
            <BarItem icon="log-out-outline" label={role === 'host' ? 'Quitter' : 'Quitter la scène'} onPress={() => (role === 'guest' ? leaveStage() : onClose())} />
            <BarItem
              icon={micOn && !mutedByHost ? 'mic' : 'mic-off'}
              label="Mic"
              off={!micOn || mutedByHost}
              onPress={() => {
                if (mutedByHost) return toast.show('Lève la main : l’hôte te donnera la parole');
                setMicOn((m) => !m);
                toast.show(micOn ? 'Micro coupé' : 'Micro ouvert');
              }}
            />
            <BarItem icon={camOn ? 'videocam' : 'videocam-off'} label="Caméra" off={!camOn} onPress={() => setCamOn((c) => !c)} />
            <Pressable
              onPress={() => {
                tap();
                if (role === 'host') setSheet('requests');
                else toggleMyHand();
              }}
              style={styles.center}
            >
              <LinearGradient colors={goldGradient} style={styles.centerBtn}>
                <Text style={{ fontSize: role === 'host' ? 20 : 18 }}>{role === 'host' ? '🎤' : '✋'}</Text>
              </LinearGradient>
              <Text style={styles.centerLabel} numberOfLines={1}>
                {role === 'host' ? 'Donner la parole' : myHand ? 'Main levée' : 'Demander à parler'}
              </Text>
              {role === 'host' && hands.length + stage.requests.length > 0 && (
                <View style={styles.centerBadge}>
                  <Text style={styles.centerBadgeText}>{hands.length + stage.requests.length}</Text>
                </View>
              )}
            </Pressable>
            <BarItem icon="camera-reverse" label="Retourner" onPress={() => void media.flipCamera()} />
            <BarItem icon="happy" label="Réactions" onPress={() => setSheet('react')} />
            <BarItem icon="ellipsis-horizontal" label="Plus" onPress={() => setSheet('more')} />
          </View>
        )}
      </KeyboardAvoidingView>

      {fly.layer}
      <Toast text={toast.text} top={T + 96} />

      {/* demandes de parole et de montée (hôte) */}
      <Sheet
        open={sheet === 'requests'}
        onClose={close}
        title="Demandes"
        subtitle={
          hands.length || stage.requests.length
            ? `${hands.length} main(s) levée(s) · ${stage.requests.length} spectateur(s) veulent monter`
            : 'Aucune demande pour le moment.'
        }
      >
        {hands.map((g) => (
          <View key={g.slot} style={styles.reqCard}>
            <View style={styles.reqTop}>
              <Initial name={g.name ?? '?'} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={L.name}>{g.name}</Text>
                <Text style={L.sub}>Place {g.slot} · ✋ main levée</Text>
              </View>
            </View>
            <View style={styles.reqBtns}>
              <Pressable onPress={() => (tap(), refuse(g.uid))} style={[L.smallBtn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)' }]}>
                <Text style={L.smallDimText}>Refuser</Text>
              </Pressable>
              <Pressable onPress={() => (tap(), giveFloor(g.uid, g.name))} style={{ flex: 2 }}>
                <LinearGradient colors={goldGradient} style={L.smallBtn}>
                  <Text style={L.smallGoldText}>🎤 Donner la parole</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ))}
        {stage.requests.length > 0 && (
          <Pressable onPress={() => setSheet('rise')} style={{ paddingVertical: 10 }}>
            <Text style={[L.sub, { color: colors.gold, fontWeight: '800' }]}>
              Voir les {stage.requests.length} demande(s) de montée ›
            </Text>
          </Pressable>
        )}
      </Sheet>

      <Sheet open={sheet === 'invite'} onClose={close} title="Partager ce live" subtitle={`Invite ta communauté à rejoindre le Micro Ouvert de ${hostName}.`}>
        <ShareRow
          onPick={() => {
            close();
            toast.show('Invitation partagée ✅');
          }}
        />
      </Sheet>

      <Sheet open={sheet === 'react'} onClose={close} title="Réactions">
        <View style={styles.reactGrid}>
          {REACTIONS.map((e) => (
            <Pressable
              key={e}
              onPress={() => {
                tap();
                fly.add(e);
              }}
              style={styles.react}
            >
              <Text style={{ fontSize: 30 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      </Sheet>

      <Sheet open={sheet === 'gifts'} onClose={close} title="Envoyer des Zems" subtitle="Les Zems arrivent bientôt sur Zembo">
        <GiftGrid
          gifts={GIFTS}
          onPick={(g) => {
            close();
            fly.add(g.emoji, undefined, undefined, true);
            send(`a envoyé ${g.emoji} ${g.name}`);
          }}
        />
      </Sheet>

      <Sheet open={sheet === 'more'} onClose={close} title={`Options du live · ${ROLE_LABEL[role]}`}>
        {moreItems.map((it) => (
          <OptionRow
            key={it.title}
            emoji={it.emoji}
            title={it.title}
            sub={it.sub}
            badge={'badge' in it ? it.badge : undefined}
            danger={'danger' in it ? it.danger : undefined}
            onPress={() => {
              close();
              setTimeout(it.action, 220);
            }}
          />
        ))}
      </Sheet>

      <Sheet open={sheet === 'places'} onClose={close} title="Gérer les places" subtitle={`4 places maximum sur scène · ${freeSlots} libre(s)`}>
        {guests.map((g) => (
          <View key={g.slot} style={L.rowCard}>
            {g.name ? (
              <Initial name={g.name} size={36} />
            ) : (
              <View style={[L.av36, styles.emptyAv]}>
                <Text style={{ color: colors.gold, fontSize: 18, fontWeight: '800' }}>+</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={L.name}>{g.name ?? 'Place libre'}</Text>
              <Text style={L.sub}>
                Place {g.slot}
                {g.name ? (g.mic ? ' · 🎤 a la parole' : ' · micro coupé') : ''}
              </Text>
            </View>
            {g.name && (
              <Pressable onPress={() => kick(g.uid, g.name)} style={[L.smallBtn, { borderWidth: 1, borderColor: 'rgba(240,113,103,0.5)' }]}>
                <Text style={[L.smallDimText, { color: '#F07167' }]}>Faire descendre</Text>
              </Pressable>
            )}
          </View>
        ))}
      </Sheet>

      <Sheet
        open={sheet === 'rise'}
        onClose={close}
        title="Demandes de montée"
        subtitle={freeSlots === 0 ? "Scène pleine — libère une place d'abord." : `${stage.requests.length} spectateur(s) veulent monter · ${freeSlots} place(s) libre(s)`}
      >
        {stage.requests.map((r) => (
          <View key={r.uid} style={styles.reqCard}>
            <View style={styles.reqTop}>
              <Initial name={r.pseudo} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={L.name}>{r.pseudo || 'Invité'}</Text>
                <Text style={L.sub}>Spectateur · ✋ veut monter</Text>
              </View>
            </View>
            <View style={styles.reqBtns}>
              <Pressable onPress={() => (tap(), run(stage.decline(r.uid)))} style={[L.smallBtn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)' }]}>
                <Text style={L.smallDimText}>Refuser</Text>
              </Pressable>
              <Pressable onPress={() => (tap(), promote(r.uid, r.pseudo))} style={{ flex: 2 }}>
                <LinearGradient colors={goldGradient} style={L.smallBtn}>
                  <Text style={L.smallGoldText}>Faire monter</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ))}
        {stage.requests.length === 0 && <Text style={L.sub}>Aucune demande pour le moment.</Text>}
      </Sheet>

      {ended && (
        <View style={endStyles.wrap}>
          <View style={endStyles.card}>
            <Initial name={hostName} size={60} />
            <Text style={endStyles.title}>Le live est terminé</Text>
            <Text style={endStyles.text}>Merci d’être passé·e au Micro Ouvert de {hostName} !</Text>
            <Pressable onPress={onClose} style={{ alignSelf: 'stretch' }}>
              <LinearGradient colors={goldGradient} style={endStyles.btn}>
                <Text style={endStyles.btnText}>Fermer</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const endStyles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  card: { alignSelf: 'stretch', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 24 },
  title: { color: colors.text, fontSize: 20, fontWeight: '900' },
  text: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginBottom: 8 },
  btn: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
});
