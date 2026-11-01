import { useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { HELLO_AGES, PREVIEWS, ageNumber, findPerson, firstMessages, intentionLabels, thumbOf } from './data';
import { tap, useWorld } from './store';
import { DEENA_PHOTO } from '../table/data';
import { Chip, GoldButton, worldBg } from './ui';

function Head({ title, sub }: { title: string; sub: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 18, paddingBottom: 6 }}>
      <Text style={styles.h1}>{title}</Text>
      <Text style={styles.hSub}>{sub}</Text>
    </View>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg}>
      {options.map(([k, label]) => {
        const on = k === value;
        return (
          <Pressable
            key={k}
            style={{ flex: 1 }}
            onPress={() => {
              tap();
              onChange(k);
            }}
          >
            {on ? (
              <LinearGradient colors={goldGradient} style={styles.segItem}>
                <Text style={styles.segOn}>{label}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.segItem}>
                <Text style={styles.segOff}>{label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

// Onglet Hellos : reçus / envoyés
export function WorldHellos({ onOpen }: { onOpen: (id: string, step: 'card' | 'celebration') => void }) {
  const w = useWorld();
  const [tab, setTab] = useState<'recus' | 'envoyes'>('recus');
  return (
    <View style={styles.root}>
      <Head title="Hellos" sub="Un Hello ne crée pas de conversation : il faut un Hello mutuel." />
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ['recus', `Reçus${w.pending.length ? ` (${w.pending.length})` : ''}`],
          ['envoyes', `Envoyés${w.sent.length ? ` (${w.sent.length})` : ''}`],
        ]}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        {tab === 'recus' ? (
          <>
            {w.pending.length === 0 && <Text style={styles.empty}>Aucun Hello en attente pour l'instant.</Text>}
            {w.pending.map((p) => (
              <View key={p.id} style={styles.helloCard}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Image source={thumbOf(p)} style={styles.helloAvatar} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.helloTitle}>
                      👋 {p.name} t'a envoyé un Hello depuis {p.country}
                    </Text>
                    <Text style={styles.helloMeta}>
                      {p.flag} {p.city} · {p.age} ans · {HELLO_AGES[p.id] ?? "à l'instant"}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <SmallBtn label="Voir" onPress={() => onOpen(p.id, 'card')} />
                  <SmallBtn label="👋 Répondre" gold onPress={() => onOpen(p.id, 'celebration')} />
                  <SmallBtn
                    label="Ignorer"
                    dim
                    onPress={() => {
                      w.ignoreHello(p.id);
                      w.showToast('Hello ignoré');
                    }}
                  />
                </View>
              </View>
            ))}
          </>
        ) : (
          <>
            {w.sent.length === 0 && <Text style={styles.empty}>Tu n'as envoyé aucun Hello pour l'instant.</Text>}
            {w.sent.map((p) => (
              <View key={p.id} style={[styles.helloCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
                <Image source={thumbOf(p)} style={styles.sentAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.helloTitle}>
                    {p.name} {p.flag}
                  </Text>
                  <Text style={styles.helloMeta}>⏳ En attente de sa réponse…</Text>
                </View>
                <SmallBtn
                  label="Annuler"
                  dim
                  onPress={() => {
                    w.cancelHello(p.id);
                    w.showToast('Hello annulé');
                  }}
                />
              </View>
            ))}
          </>
        )}
        <Text style={styles.rule}>👋 Hello mutuel → rencontre 60 s → connexion mutuelle.</Text>
        <Pressable
          onPress={() => {
            w.resetHellos();
            w.showToast('Démo réinitialisée');
          }}
          style={{ alignSelf: 'center' }}
          hitSlop={8}
        >
          <Text style={styles.demo}>↺ Démo</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function SmallBtn({ label, onPress, gold, dim }: { label: string; onPress: () => void; gold?: boolean; dim?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={{ flex: dim ? 0 : 1 }}
    >
      {gold ? (
        <LinearGradient colors={goldGradient} style={styles.small}>
          <Text style={styles.smallGold}>{label}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.small, dim ? styles.smallDim : styles.smallLine]}>
          <Text style={dim ? styles.smallDimText : styles.smallLineText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Onglet Messages : seulement les connexions mutuelles
export function WorldMessages({ onThread, onHellos }: { onThread: (id: string) => void; onHellos: () => void }) {
  const w = useWorld();
  return (
    <View style={styles.root}>
      <Head title="Messages World" sub="🌍 Tes connexions World : messagerie distincte de Zembo." />
      <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
        {w.connections.length === 0 && (
          <Text style={[styles.empty, { margin: 16 }]}>
            Tes connexions mutuelles apparaîtront ici.{'\n'}Hello mutuel → rencontre 60 secondes → connexion mutuelle.
          </Text>
        )}
        {w.connections.map((c) => {
          const thread = w.threads[c.id];
          const last = thread ? thread[thread.length - 1] : null;
          const preview = PREVIEWS[c.id];
          const unread = w.unread[c.id] ?? 0;
          return (
            <Pressable
              key={c.id}
              style={styles.convo}
              onPress={() => {
                tap();
                onThread(c.id);
              }}
            >
              <View>
                <Image source={thumbOf(c)} style={styles.convoAvatar} />
                <View style={styles.flag}>
                  <Text style={{ fontSize: 12 }}>{c.flag}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.convoName}>{c.name}</Text>
                <Text style={[styles.convoLast, unread > 0 && { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
                  {last ? `${last.me ? 'Toi : ' : ''}${last.text}` : (preview?.last ?? "Conversation ouverte, à toi de jouer.")}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 5 }}>
                <Text style={styles.convoTime}>{last ? 'Maintenant' : (preview?.time ?? 'Maintenant')}</Text>
                {unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unread}</Text>
                  </View>
                ) : (
                  <Ionicons name="chatbubble-outline" size={14} color={colors.textFaint} />
                )}
              </View>
            </Pressable>
          );
        })}
        {w.pending.length > 0 && (
          <Pressable
            onPress={() => {
              tap();
              onHellos();
            }}
            style={styles.pendingLink}
          >
            <Text style={styles.pendingText}>
              👋 {w.pending.length} Hello{w.pending.length > 1 ? 's' : ''} en attente
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gold} />
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

// Conversation débloquée après une connexion mutuelle
export function WorldThread({ id, onBack }: { id: string; onBack: () => void }) {
  const insets = useSafeAreaInsets();
  const w = useWorld();
  const p = findPerson(id)!;
  const [draft, setDraft] = useState('');
  const msgs = w.threads[id] ?? firstMessages(p);
  useEffect(() => {
    w.markRead(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    tap();
    w.sendMessage(id, t);
    setDraft('');
  };
  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.threadHead}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={colors.gold} />
        </Pressable>
        <Image source={thumbOf(p)} style={styles.threadAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.threadName}>{p.name}</Text>
          <Text style={styles.threadSub}>
            {p.flag} {p.city} · Connexion mutuelle
          </Text>
        </View>
      </View>
      <FlatList
        inverted
        data={[...msgs].reverse()}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14, gap: 6 }}
        keyboardDismissMode="interactive"
        ListFooterComponent={
          <Text style={styles.banner}>
            🎉 Vous vous êtes dit Hello, vous vous êtes rencontrés 60 secondes et vous avez choisi de vous connecter. À vous de jouer.
          </Text>
        }
        renderItem={({ item }) =>
          item.me ? (
            <View style={{ alignItems: 'flex-end' }}>
              <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.mine]}>
                <Text style={styles.mineText}>{item.text}</Text>
              </LinearGradient>
            </View>
          ) : (
            <View style={{ alignItems: 'flex-start' }}>
              <View style={[styles.bubble, styles.theirs]}>
                <Text style={styles.theirsText}>{item.text}</Text>
              </View>
            </View>
          )
        }
      />
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.input}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Écris un message…"
            placeholderTextColor={colors.textFaint}
            style={styles.inputText}
            selectionColor={colors.gold}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable onPress={() => setDraft((d) => d + '😊')} hitSlop={6}>
            <Ionicons name="happy-outline" size={21} color={colors.textDim} />
          </Pressable>
        </View>
        <Pressable onPress={send}>
          <LinearGradient colors={goldGradient} style={styles.send}>
            <Ionicons name="send" size={16} color="#1D1405" />
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// Onglet Mon profil World
export function WorldMyProfile({ onEdit, onMessages, onQuit }: { onEdit: (step: number) => void; onMessages: () => void; onQuit: () => void }) {
  const w = useWorld();
  const d = w.profile;
  const age = ageNumber(d.age);
  const labels = intentionLabels(d.intentions);
  const [rule, setRule] = useState<'Tout le monde' | 'Selon mes critères'>('Tout le monde');
  const [visible, setVisible] = useState<'Visible' | 'En pause'>('Visible');
  const answers = [
    { q: '🌤 Mon dimanche parfait', a: d.answerSunday },
    { q: '🚩 Mon red flag', a: d.answerRedFlag },
    { q: '✈️ Mon évasion rêvée', a: d.answerEscape },
  ].filter((x) => x.a.trim());
  return (
    <View style={styles.root}>
      <Head title="Mon profil World" sub="Voici ce que les autres voient de toi." />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        {/* World Card */}
        <View style={styles.wc}>
          <View style={styles.wcPhoto}>
            <Image source={d.photos[0] ?? DEENA_PHOTO} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={['transparent', 'rgba(8,6,3,0.95)']} style={[StyleSheet.absoluteFill, { top: '45%' }]} />
            <View style={styles.wcInfo}>
              <Text style={styles.wcName}>
                @{d.username || 'ton_pseudo'}
                {d.showAge && age !== null ? `, ${age}` : ''}
              </Text>
              <Text style={styles.wcPlace}>📍 {[d.city, d.country].filter(Boolean).join(', ') || 'Ta ville'}</Text>
              {labels[0] && (
                <View style={styles.wcIntent}>
                  <Text style={styles.wcIntentText}>✨ {labels[0]}</Text>
                </View>
              )}
            </View>
          </View>
          <View style={{ padding: 14 }}>
            <Text style={styles.wcBio}>« {d.bio || 'Ajoute une petite phrase qui te ressemble.'} »</Text>
            {d.languages.length > 0 && (
              <View style={[styles.wrap, { marginTop: 10 }]}>
                {d.languages.map((l) => (
                  <Chip key={l} label={l} />
                ))}
              </View>
            )}
            {answers.map((x) => (
              <View key={x.q} style={styles.answer}>
                <Text style={styles.answerLabel}>{x.q}</Text>
                <Text style={styles.answerValue}>{x.a}</Text>
              </View>
            ))}
            <GoldButton label="✏️ Éditer mon profil World" onPress={() => onEdit(1)} style={{ marginTop: 14 }} />
          </View>
        </View>

        <Text style={styles.section}>Mes photos</Text>
        <View style={styles.wrap}>
          {d.photos.map((p, i) => (
            <View key={`${p}-${i}`}>
              <Image source={p} style={styles.photo} />
              {i === 0 && (
                <LinearGradient colors={goldGradient} style={styles.mainTag}>
                  <Text style={styles.mainTagText}>Principale</Text>
                </LinearGradient>
              )}
            </View>
          ))}
          {d.photos.length < 6 && (
            <Pressable onPress={() => onEdit(2)} style={[styles.photo, styles.photoAdd]}>
              <Ionicons name="add" size={22} color={colors.gold} />
              <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '700' }}>Ajouter</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.section}>Mes connexions</Text>
        {w.connections.length === 0 ? (
          <Text style={styles.empty}>Aucune connexion mutuelle pour l'instant.</Text>
        ) : (
          <Pressable
            style={styles.settingRow}
            onPress={() => {
              tap();
              onMessages();
            }}
          >
            <View style={{ flexDirection: 'row' }}>
              {w.connections.slice(0, 6).map((c, i) => (
                <Image key={c.id} source={thumbOf(c)} style={[styles.stack, { marginLeft: i ? -10 : 0 }]} />
              ))}
            </View>
            <Text style={[styles.settingText, { flex: 1 }]}>
              {w.connections.length} connexion{w.connections.length > 1 ? 's' : ''} World
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.gold} />
          </Pressable>
        )}

        <Text style={styles.section}>Réglages World Room</Text>
        <View style={styles.settingCard}>
          <Text style={styles.settingLabel}>👋 Qui peut m'envoyer un Hello</Text>
          <Segmented
            value={rule}
            onChange={(v) => {
              setRule(v);
              w.showToast(`Hellos : ${v.toLowerCase()}`);
            }}
            options={[
              ['Tout le monde', 'Tout le monde'],
              ['Selon mes critères', 'Selon mes critères'],
            ]}
          />
          <Text style={[styles.settingLabel, { marginTop: 14 }]}>👁 Visibilité de mon profil</Text>
          <Segmented
            value={visible}
            onChange={(v) => {
              setVisible(v);
              w.showToast(v === 'Visible' ? 'Profil visible' : 'Profil en pause');
            }}
            options={[
              ['Visible', 'Visible'],
              ['En pause', 'En pause'],
            ]}
          />
        </View>
        <Pressable style={[styles.settingRow, { marginTop: 10 }]} onPress={() => onEdit(5)}>
          <Ionicons name="language" size={18} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.settingText}>Langues</Text>
            <Text style={styles.settingSub}>{d.languages.join(' · ') || 'Aucune langue choisie'}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
        </Pressable>
        <Pressable
          style={styles.quit}
          onPress={() => {
            tap();
            onQuit();
          }}
        >
          <Ionicons name="log-out-outline" size={16} color="#F07167" />
          <Text style={styles.quitText}>Quitter World Room</Text>
        </Pressable>
        <Text style={[styles.empty, { marginTop: 14, textAlign: 'center' }]}>Ton profil World Room est lié à ton compte Zembo.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: worldBg },
  h1: { color: colors.text, fontSize: 26, fontWeight: '900' },
  hSub: { color: colors.textDim, fontSize: 13, marginTop: 4 },
  seg: { flexDirection: 'row', gap: 4, padding: 4, marginHorizontal: 16, marginTop: 10, borderRadius: 14, backgroundColor: '#17120B', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  segItem: { height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { color: '#1D1405', fontSize: 12.5, fontWeight: '900' },
  segOff: { color: 'rgba(247,241,225,0.65)', fontSize: 12.5, fontWeight: '600' },
  empty: { color: colors.textDim, fontSize: 13.5, lineHeight: 20 },
  helloCard: { padding: 14, borderRadius: 18, backgroundColor: '#15100A', borderWidth: 1, borderColor: 'rgba(212,175,55,0.25)' },
  helloAvatar: { width: 58, height: 58, borderRadius: 29, borderWidth: 2, borderColor: colors.gold },
  sentAvatar: { width: 46, height: 46, borderRadius: 23 },
  helloTitle: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  helloMeta: { color: colors.textDim, fontSize: 12.5, marginTop: 3 },
  small: { height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  smallGold: { color: '#1D1405', fontSize: 13, fontWeight: '900' },
  smallLine: { borderWidth: 1, borderColor: 'rgba(212,175,55,0.45)' },
  smallLineText: { color: colors.gold, fontSize: 13, fontWeight: '800' },
  smallDim: { backgroundColor: 'rgba(255,255,255,0.06)' },
  smallDimText: { color: colors.textDim, fontSize: 13, fontWeight: '700' },
  rule: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 14 },
  demo: { color: colors.textFaint, fontSize: 12, fontWeight: '700' },
  convo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  convoAvatar: { width: 54, height: 54, borderRadius: 27 },
  flag: { position: 'absolute', right: -3, bottom: -3, width: 22, height: 22, borderRadius: 11, backgroundColor: worldBg, alignItems: 'center', justifyContent: 'center' },
  convoName: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
  convoLast: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  convoTime: { color: colors.textFaint, fontSize: 11.5 },
  badge: { minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 5, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#1D1405', fontSize: 10.5, fontWeight: '900' },
  pendingLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, margin: 16, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(212,175,55,0.35)', backgroundColor: 'rgba(212,175,55,0.08)' },
  pendingText: { color: colors.gold, fontSize: 14, fontWeight: '800' },
  threadHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(212,175,55,0.3)' },
  threadAvatar: { width: 38, height: 38, borderRadius: 19 },
  threadName: { color: colors.text, fontSize: 16, fontWeight: '800' },
  threadSub: { color: colors.gold, fontSize: 11.5, fontWeight: '600' },
  banner: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, textAlign: 'center', padding: 12, marginBottom: 10, borderRadius: 14, backgroundColor: 'rgba(212,175,55,0.08)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)' },
  bubble: { maxWidth: '76%', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 18 },
  mine: { borderBottomRightRadius: 5 },
  theirs: { borderBottomLeftRadius: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  mineText: { color: '#1D1405', fontSize: 15, fontWeight: '600' },
  theirsText: { color: colors.text, fontSize: 15 },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(212,175,55,0.25)' },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.2)' },
  inputText: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  wc: { borderRadius: 22, overflow: 'hidden', backgroundColor: '#15100A', borderWidth: 1, borderColor: 'rgba(212,175,55,0.3)' },
  wcPhoto: { height: 300 },
  wcInfo: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  wcName: { color: colors.white, fontSize: 24, fontWeight: '900' },
  wcPlace: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  wcIntent: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(212,175,55,0.2)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.5)' },
  wcIntentText: { color: colors.goldLight, fontSize: 12, fontWeight: '800' },
  wcBio: { color: colors.text, fontSize: 14.5, fontStyle: 'italic', lineHeight: 20 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  answer: { padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(212,175,55,0.15)', marginTop: 8 },
  answerLabel: { color: colors.gold, fontSize: 12, fontWeight: '800' },
  answerValue: { color: colors.text, fontSize: 14, marginTop: 3 },
  section: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 24, marginBottom: 10 },
  photo: { width: 74, height: 96, borderRadius: 12 },
  photoAdd: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(212,175,55,0.4)' },
  mainTag: { position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  mainTagText: { color: '#1D1405', fontSize: 9, fontWeight: '900' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#15100A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  stack: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#15100A' },
  settingText: { color: colors.text, fontSize: 14.5, fontWeight: '700' },
  settingSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  settingCard: { paddingVertical: 14, borderRadius: 16, backgroundColor: '#15100A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  settingLabel: { color: colors.textDim, fontSize: 12.5, fontWeight: '700', marginHorizontal: 16 },
  quit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18, height: 46, borderRadius: 23, borderWidth: 1, borderColor: 'rgba(240,113,103,0.4)' },
  quitText: { color: '#F07167', fontSize: 14, fontWeight: '800' },
});
