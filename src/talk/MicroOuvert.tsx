import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import {
  ChatInput,
  GiftGrid,
  LiveBadge,
  LiveChat,
  LiveSlide,
  OptionRow,
  Pill,
  ShareRow,
  Sheet,
  SideAction,
  Toast,
  faceOf,
  liveStyles as L,
  tap,
  useFloaters,
  useLiveChat,
  useToast,
  type Gift,
} from './LiveKit';
import { useSession } from '../lib/session';
import { useHostOnAir } from '../live/onair';
import { HostCam } from '../live/HostCam';

// Micro Ouvert : Deena anime, jusqu'à 4 invités montent sur scène (repris de zembolounge)
const HOST = require('../../assets/talk/micro-host.jpg');
const HOST_FACE = require('../../assets/talk/micro-face.jpg'); // la personne à l'écran
const SUBJECT = "Amour, amitié ou argent : qu'est-ce qui rend vraiment heureux ?";

type Guest = { slot: 1 | 2 | 3 | 4; name: string | null; mic: boolean; hand: boolean; speaking: boolean };
type Role = 'host' | 'guest' | 'viewer';
const ROLE_LABEL: Record<Role, string> = { host: '👑 Hôte', guest: '🙋 Invité', viewer: '👁 Spectateur' };
const NEXT_ROLE: Record<Role, Role> = { host: 'guest', guest: 'viewer', viewer: 'host' };
const ME_SLOT = 3; // en vue invité, je suis à la place 3

const CHAT0: [string, string][] = [
  ['Sophie', 'Tellement vrai ! 👏'],
  ['Kevin', 'Je veux monter 🙏'],
  ['Lina', 'Super débat 👌'],
  ['Djamal', 'Ça fait réfléchir…'],
  ['Noura', 'Respect à tous les intervenants ! ❤️'],
  ['Alex', 'Open Mic toujours au top ! 🔥'],
];
const AUTO: [string, string][] = [
  ['Fatou', 'Aïssatou a trop raison 💯'],
  ['Momo', 'Passe le micro à Jordan 🎤'],
  ['Nadia', 'Je lève la main aussi ✋'],
  ['Yann', 'Ambiance parfaite ce soir ✨'],
  ['Emma', 'Deena gère le débat 👑'],
  ['Karim', "L'argent ne fait pas tout…"],
];
const GIFTS: Gift[] = [
  { name: 'Rose', emoji: '🌹', cost: 5 },
  { name: 'Cœur', emoji: '💖', cost: 10 },
  { name: "Micro d'or", emoji: '🎤', cost: 30 },
  { name: 'Étoile', emoji: '⭐', cost: 25 },
  { name: 'Feu', emoji: '🔥', cost: 15 },
  { name: 'Couronne', emoji: '👑', cost: 99 },
];
const REACTIONS = ['❤️', '🔥', '👏', '😂', '🙏', '✨', '💯', '🎤', '😮', '👑'];

const clock = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');

export function MicroOuvert({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <LiveSlide open={open}>
      <MicroLive onClose={onClose} />
    </LiveSlide>
  );
}

function MicroLive({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const T = insets.top;
  const chat = useLiveChat(CHAT0, AUTO, 3200);
  const fly = useFloaters();
  const toast = useToast();
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  const [role, setRole] = useState<Role>('host');
  // quand tu es l'hôte, le live apparaît sur l'accueil et les messages des spectateurs arrivent ici
  const { profile, user } = useSession();
  const onAir = useHostOnAir('openmic', {
    active: !!user && role === 'host',
    title: SUBJECT,
    pseudo: profile?.pseudo,
    name: [profile?.prenom, profile?.nom].filter(Boolean).join(' '),
    onMessage: (m) => chat.push(m.pseudo, m.text),
  });
  const [guests, setGuests] = useState<Guest[]>([
    { slot: 1, name: 'Malik', mic: true, hand: false, speaking: true },
    { slot: 2, name: 'Aïssatou', mic: false, hand: true, speaking: false },
    { slot: 3, name: 'Jordan', mic: false, hand: true, speaking: false },
    { slot: 4, name: null, mic: false, hand: false, speaking: false },
  ]);
  const [myHand, setMyHand] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [riseQueue, setRiseQueue] = useState(['Kevin', 'Nadia']);
  const [riseAsked, setRiseAsked] = useState(false);
  const [seconds, setSeconds] = useState(4356);
  const [viewers, setViewers] = useState(325);
  const [follow, setFollow] = useState(false);
  const [sheet, setSheet] = useState<'requests' | 'invite' | 'react' | 'gifts' | 'more' | 'places' | 'rise' | null>(null);

  const hands = useMemo(() => guests.filter((g) => g.name && g.hand), [guests]);
  const freeSlots = guests.filter((g) => !g.name).length;

  useEffect(() => {
    const a = setInterval(() => setSeconds((s) => s + 1), 1000);
    const b = setInterval(() => setViewers((v) => Math.max(280, v + Math.round((Math.random() - 0.45) * 8))), 2400);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const close = () => setSheet(null);
  const toggleMyHand = () => {
    const next = !myHand;
    setMyHand(next);
    setGuests((gs) => gs.map((g) => (g.slot === ME_SLOT ? { ...g, hand: next } : g)));
    toast.show(next ? 'Ta main est levée ✋' : 'Demande annulée');
  };
  const giveFloor = (slot: number) => {
    const g = guests.find((x) => x.slot === slot);
    // une seule personne parle à la fois
    setGuests((gs) => gs.map((x) => (x.slot === slot ? { ...x, hand: false, mic: true, speaking: true } : { ...x, speaking: false })));
    toast.show(`${g?.name} a la parole 🎤`);
    if (slot === ME_SLOT) setMyHand(false);
  };
  const refuse = (slot: number) => {
    setGuests((gs) => gs.map((g) => (g.slot === slot ? { ...g, hand: false } : g)));
    if (slot === ME_SLOT) setMyHand(false);
  };
  const leaveStage = () => {
    setMyHand(false);
    setGuests((gs) => gs.map((g) => (g.slot === ME_SLOT ? { ...g, name: null, mic: false, hand: false, speaking: false } : g)));
    setRole('viewer');
    setRiseAsked(false);
    toast.show('Tu es redescendu·e 👁 Spectateur');
  };
  const kick = (slot: number) => {
    const name = guests.find((g) => g.slot === slot)?.name;
    setGuests((gs) => gs.map((g) => (g.slot === slot ? { ...g, name: null, mic: false, hand: false, speaking: false } : g)));
    toast.show(`${name} est redescendu·e`);
  };
  const askRise = () => {
    setRiseAsked(true);
    toast.show("Demande envoyée ⏳ En attente de l'hôte");
  };
  const promote = (name: string) => {
    const free = guests.find((g) => !g.name);
    if (!free) {
      toast.show("Table pleine — libère une place d'abord");
      return;
    }
    setGuests((gs) => gs.map((g) => (g.slot === free.slot ? { ...g, name, mic: false, hand: false, speaking: false } : g)));
    setRiseQueue((q) => q.filter((n) => n !== name));
    toast.show(`${name} monte sur scène 🎤`);
  };

  const moreItems =
    role === 'host'
      ? [
          { emoji: '🙋', title: 'Gérer les places', sub: `4 places max · ${freeSlots} libre(s)`, action: () => setSheet('places') },
          { emoji: '✋', title: 'Demandes de montée', sub: 'Spectateurs qui veulent une place', badge: riseQueue.length, action: () => setSheet('rise') },
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
            { emoji: '🔇', title: 'Couper le son du live', sub: 'Continuer à lire le chat en silence', action: () => toast.show('Son du live coupé') },
            { emoji: '🚫', title: 'Signaler le live', sub: 'Prévenir la modération Zembo', action: () => toast.show('Signalement transmis') },
            { emoji: '📄', title: 'Règles de la communauté', sub: 'Respect • Pas de jugement • Bonne vibe ✨', action: () => toast.show('Règles affichées') },
            { emoji: '🚪', title: 'Quitter', sub: 'Sortir du live', action: onClose, danger: true },
          ];

  const stageH = Math.round(width * 0.82);
  const tileW = (width - 12 * 2 - 6 * 3) / 4;

  return (
    <View style={{ flex: 1, backgroundColor: '#07050A' }}>
      {/* fond flouté + scène de l'hôte */}
      <Image source={HOST} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,5,12,0.55)' }]} />
      <View style={{ position: 'absolute', top: T + 88, left: 0, right: 0, height: stageH }}>
        <Image source={HOST} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
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
          <Image source={HOST_FACE} style={styles.hostAv} />
          <View>
            <Text style={styles.hostName}>Deena 👑</Text>
            <Text style={styles.hostRole}>Hôte</Text>
          </View>
          {role !== 'host' && (
            <Pressable
              onPress={() => {
                tap();
                setFollow((f) => !f);
              }}
              style={[follow ? L.followOn : L.followOff, { marginLeft: 2 }]}
            >
              <Text style={follow ? L.followTextOn : L.followTextOff}>{follow ? 'Suivi ✓' : '+ Suivre'}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.liveRow} pointerEvents="none">
          <LiveBadge />
          <Text style={styles.clock}>{clock(seconds)}</Text>
        </View>
      </View>

      {/* ta caméra d'hôte, telle que la voient les spectateurs de l'accueil */}
      <HostCam room={onAir.room} viewers={onAir.viewers} name={profile?.pseudo} style={{ top: T + 160, left: 14 }} controls="right" />

      {/* en-tête */}
      <View style={[styles.head, { top: T + 4 }]}>
        <LinearGradient colors={goldGradient} style={styles.z}>
          <Text style={styles.zText}>Z</Text>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>MICRO OUVERT</Text>
          <Text style={styles.subject} numberOfLines={2}>
            Sujet : {SUBJECT}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pill>
              <Ionicons name="eye" size={11} color={colors.text} />
              <Text style={L.pillText}>{viewers}</Text>
            </Pill>
            <Pressable onPress={() => setSheet('more')} style={L.round} hitSlop={6}>
              <Ionicons name="ellipsis-horizontal" size={16} color={colors.text} />
            </Pressable>
            <Pressable onPress={onClose} style={L.round} hitSlop={6}>
              <Ionicons name="close" size={17} color={colors.text} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              tap();
              setRole((r) => NEXT_ROLE[r]);
            }}
            style={styles.roleChip}
          >
            <Text style={styles.roleText}>{ROLE_LABEL[role]}</Text>
            <Ionicons name="swap-horizontal" size={11} color={colors.gold} />
          </Pressable>
        </View>
      </View>

      {/* 4 places invités */}
      <View style={[styles.guests, { top: T + 88 + stageH - 64 }]}>
        {guests.map((g) => {
          const isMe = role === 'guest' && g.slot === ME_SLOT;
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
          return (
            <Pressable
              key={g.slot}
              onPress={() => {
                tap();
                if (role === 'host' && g.hand) giveFloor(g.slot);
                else if (isMe) toggleMyHand();
              }}
              style={[styles.tile, { width: tileW }, g.hand ? styles.tileHand : g.speaking && g.mic ? styles.tileSpeak : null]}
            >
              <Image source={faceOf(g.name, 200)} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={[StyleSheet.absoluteFill, { top: '45%' }]} />
              <View style={styles.slotNum}>
                <Text style={styles.slotNumText}>{g.slot}</Text>
              </View>
              {g.hand && <Hand />}
              <View style={styles.tileFoot}>
                <Ionicons name={g.mic ? 'mic' : 'mic-off'} size={10} color={g.mic ? colors.gold : '#F07167'} />
                <Text style={styles.tileName} numberOfLines={1}>
                  {isMe ? 'Toi' : g.name}
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
        {/* demander à monter / à parler directement, sans passer par le menu */}
        {role === 'viewer' && (
          <SideAction
            icon="hand-right"
            accent={riseAsked ? '#5A5146' : '#2EC4A6'}
            label={riseAsked ? 'En attente' : 'Monter'}
            onPress={() => (riseAsked ? toast.show("Ta demande est en attente de l'hôte…") : askRise())}
          />
        )}
        {role === 'guest' && <SideAction icon="hand-right" accent={myHand ? colors.gold : '#2EC4A6'} label={myHand ? 'Main levée' : 'Parler'} onPress={toggleMyHand} />}
        <SideAction icon="Z" label="Zems" gold onPress={() => setSheet('gifts')} />
      </View>

      {/* chat + saisie + barre du bas */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottom} pointerEvents="box-none">
        <LiveChat msgs={chat.msgs} max={5} />
        <ChatInput
          ref={input}
          onSend={(t) => {
            chat.push('Deena', t, true);
            onAir.send(t);
          }}
        />
        {role !== 'viewer' && (
          <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom - 18, 6) }]}>
            <BarItem icon="log-out-outline" label={role === 'host' ? 'Quitter' : 'Quitter la scène'} onPress={() => (role === 'guest' ? leaveStage() : onClose())} />
            <BarItem
              icon={micOn ? 'mic' : 'mic-off'}
              label="Mic"
              off={!micOn}
              onPress={() => {
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
              {role === 'host' && hands.length > 0 && (
                <View style={styles.centerBadge}>
                  <Text style={styles.centerBadgeText}>{hands.length}</Text>
                </View>
              )}
            </Pressable>
            <BarItem icon="people" label="Inviter" onPress={() => setSheet('invite')} />
            <BarItem icon="happy" label="Réactions" onPress={() => setSheet('react')} />
            <BarItem icon="ellipsis-horizontal" label="Plus" onPress={() => setSheet('more')} />
          </View>
        )}
      </KeyboardAvoidingView>

      {fly.layer}
      <Toast text={toast.text} top={T + 96} />

      {/* demandes de parole (hôte) */}
      <Sheet
        open={sheet === 'requests'}
        onClose={close}
        title="Demandes de parole"
        subtitle={hands.length ? `${hands.length} personne(s) ont levé la main. Max 4 invités sur scène.` : 'Aucune main levée pour le moment.'}
      >
        {hands.map((g) => (
          <View key={g.slot} style={styles.reqCard}>
            <View style={styles.reqTop}>
              <Image source={faceOf(g.name!, 100)} style={L.av36} />
              <View style={{ flex: 1 }}>
                <Text style={L.name}>{g.name}</Text>
                <Text style={L.sub}>Place {g.slot} · ✋ main levée</Text>
              </View>
            </View>
            <View style={styles.reqBtns}>
              <Pressable onPress={() => (tap(), refuse(g.slot))} style={[L.smallBtn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)' }]}>
                <Text style={L.smallDimText}>Refuser</Text>
              </Pressable>
              <Pressable onPress={() => (tap(), giveFloor(g.slot))} style={{ flex: 2 }}>
                <LinearGradient colors={goldGradient} style={L.smallBtn}>
                  <Text style={L.smallGoldText}>🎤 Donner la parole</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ))}
      </Sheet>

      <Sheet open={sheet === 'invite'} onClose={close} title="Partager ce live" subtitle="Invite ta communauté à rejoindre le Micro Ouvert de Deena.">
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

      <Sheet open={sheet === 'gifts'} onClose={close} title="Envoyer des Zems" subtitle="Solde : 1 250 Zems">
        <GiftGrid
          gifts={GIFTS}
          onPick={(g) => {
            close();
            fly.add(g.emoji, undefined, undefined, true);
            chat.push('Deena', `a envoyé ${g.emoji} ${g.name}`, true);
            toast.show(`Tu as envoyé ${g.emoji} ${g.name}`);
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
              <Image source={faceOf(g.name, 100)} style={L.av36} />
            ) : (
              <View style={[L.av36, styles.emptyAv]}>
                <Text style={{ color: colors.gold, fontSize: 18, fontWeight: '800' }}>+</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={L.name}>{g.name ?? 'Place libre'}</Text>
              <Text style={L.sub}>Place {g.slot}</Text>
            </View>
            {g.name && (
              <Pressable onPress={() => kick(g.slot)} style={[L.smallBtn, { borderWidth: 1, borderColor: 'rgba(240,113,103,0.5)' }]}>
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
        subtitle={freeSlots === 0 ? "Table pleine — libère une place d'abord." : `${riseQueue.length} spectateur(s) veulent monter · ${freeSlots} place(s) libre(s)`}
      >
        {riseQueue.map((n) => (
          <View key={n} style={styles.reqCard}>
            <View style={styles.reqTop}>
              <Image source={faceOf(n, 100)} style={L.av36} />
              <View style={{ flex: 1 }}>
                <Text style={L.name}>{n}</Text>
                <Text style={L.sub}>Spectateur · ✋ veut monter</Text>
              </View>
            </View>
            <View style={styles.reqBtns}>
              <Pressable onPress={() => (tap(), setRiseQueue((q) => q.filter((x) => x !== n)))} style={[L.smallBtn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)' }]}>
                <Text style={L.smallDimText}>Refuser</Text>
              </Pressable>
              <Pressable onPress={() => (tap(), promote(n))} style={{ flex: 2 }}>
                <LinearGradient colors={goldGradient} style={L.smallBtn}>
                  <Text style={L.smallGoldText}>Faire monter</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        ))}
        {riseQueue.length === 0 && <Text style={L.sub}>Aucune demande pour le moment.</Text>}
      </Sheet>
    </View>
  );
}

function BarItem({ icon, label, onPress, off }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; off?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={styles.barItem}
    >
      <Ionicons name={icon} size={19} color={off ? '#F07167' : colors.text} />
      <Text style={styles.barLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// Main levée qui balance
function Hand() {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(v, { toValue: -1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.delay(500),
      ]),
    ).start();
  }, [v]);
  return (
    <Animated.Text style={[styles.hand, { transform: [{ rotate: v.interpolate({ inputRange: [-1, 1], outputRange: ['-18deg', '18deg'] }) }] }]}>✋</Animated.Text>
  );
}

// Petites barres de son quand quelqu'un parle
function Wave() {
  const bars = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 260 + i * 60, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(b, { toValue: 0.3, duration: 260 + i * 60, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [bars]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 12 }}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={{ width: 2.5, height: 12, borderRadius: 2, backgroundColor: colors.gold, transform: [{ scaleY: b }] }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  z: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  zText: { color: '#1D1405', fontSize: 17, fontWeight: '900' },
  brand: { color: colors.goldLight, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  subject: { color: colors.text, fontSize: 11.5, fontWeight: '600', marginTop: 2, lineHeight: 15 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)' },
  roleText: { color: colors.goldLight, fontSize: 11, fontWeight: '800' },
  hostChip: { position: 'absolute', left: 12, top: 10, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 3, paddingRight: 8, paddingVertical: 3, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)' },
  hostAv: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.gold },
  hostName: { color: colors.white, fontSize: 13, fontWeight: '900' },
  hostRole: { color: colors.textDim, fontSize: 10 },
  liveRow: { position: 'absolute', left: 12, top: 52, flexDirection: 'row', alignItems: 'center', gap: 6 },
  clock: { color: colors.white, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'], textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  guests: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', gap: 6 },
  tile: { height: 118, borderRadius: 14, overflow: 'hidden', backgroundColor: '#1A1410', borderWidth: 1.5, borderColor: 'rgba(212,175,55,0.35)' },
  tileHand: { borderColor: colors.gold, borderWidth: 2.5, shadowColor: colors.gold, shadowOpacity: 0.7, shadowRadius: 10 },
  tileSpeak: { borderColor: '#5B9BF0', borderWidth: 2.5 },
  tileEmpty: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 4 },
  plus: { color: colors.gold, fontSize: 26, fontWeight: '300' },
  emptyText: { color: colors.textDim, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 2 },
  slotNum: { position: 'absolute', top: 5, left: 5, width: 17, height: 17, borderRadius: 9, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  slotNumText: { color: '#1D1405', fontSize: 10, fontWeight: '900' },
  hand: { position: 'absolute', top: 2, right: 4, fontSize: 20 },
  tileFoot: { position: 'absolute', left: 5, right: 5, bottom: 5, flexDirection: 'row', alignItems: 'center', gap: 3 },
  tileName: { flex: 1, color: colors.white, fontSize: 11, fontWeight: '800' },
  wave: { position: 'absolute', right: 5, bottom: 22 },
  actions: { position: 'absolute', right: 10, alignItems: 'center', gap: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 4, paddingTop: 8, marginTop: -4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(212,175,55,0.3)', backgroundColor: 'rgba(8,5,12,0.92)' },
  barItem: { flex: 1, alignItems: 'center', gap: 2 },
  barLabel: { color: colors.textDim, fontSize: 9, fontWeight: '700' },
  center: { flex: 2, alignItems: 'center', marginTop: -18 },
  centerBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#08050C' },
  centerLabel: { color: colors.gold, fontSize: 9.5, fontWeight: '900', marginTop: 2 },
  centerBadge: { position: 'absolute', top: -4, right: 14, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#E0457B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  centerBadgeText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  reactGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  react: { width: '18%', aspectRatio: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  reqCard: { padding: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 8 },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqBtns: { flexDirection: 'row', gap: 8, marginTop: 10 },
  emptyAv: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(212,175,55,0.5)' },
});
