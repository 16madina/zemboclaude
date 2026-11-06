import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView, type VideoThumbnail } from 'expo-video';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import {
  FILTERS,
  FilterLayer,
  GoldSlider,
  TEXT_COLORS,
  TRACKS,
  TextBubble,
  useEditPlayback,
  type PostEdit,
  type TextItem,
} from './edit';
import type { MediaKind } from './posts';
import type { DuoRef, SoundRef } from './sounds';
import { DuoFrame, DuoSource } from './duo';

// Éditeur façon CapCut : couper, son, musique, texte, filtres, couverture.
// Rien n'est recalculé : on rend des réglages, appliqués à la lecture (voir edit.tsx).

type Tool = 'cut' | 'sound' | 'music' | 'text' | 'filter' | 'cover';
const MAX = 60;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const tap = () => Haptics.selectionAsync().catch(() => {});

export function EditorScreen({
  kind,
  uri,
  duration: knownDuration,
  initial,
  lockedSound,
  duo,
  sound,
  onBack,
  onDone,
}: {
  kind: MediaKind;
  /** Duo : la vidéo d'origine s'affiche dans sa case */
  duo?: DuoRef;
  /** son repris : on l'entend dans l'aperçu */
  sound?: SoundRef;
  /** son imposé (« Utiliser ce son », Duo) : pas d'outil Musique */
  lockedSound?: string;
  uri: string;
  /** durée connue (secondes) */
  duration: number | null;
  initial?: PostEdit;
  onBack: () => void;
  onDone: (edit: PostEdit) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: sw, height: sh } = useWindowDimensions();
  const isVideo = kind === 'video';
  const tools: { id: Tool; icon: keyof typeof Ionicons.glyphMap; label: string }[] = isVideo
    ? [
        { id: 'cut', icon: 'cut', label: 'Couper' },
        { id: 'sound', icon: 'volume-high', label: 'Son' },
        { id: 'music', icon: 'musical-notes', label: 'Musique' },
        { id: 'text', icon: 'text', label: 'Texte' },
        { id: 'filter', icon: 'color-filter', label: 'Filtres' },
        { id: 'cover', icon: 'image', label: 'Couverture' },
      ]
    : [
        { id: 'text', icon: 'text', label: 'Texte' },
        { id: 'filter', icon: 'color-filter', label: 'Filtres' },
        { id: 'music', icon: 'musical-notes', label: 'Musique' },
      ];
  if (lockedSound) tools.splice(tools.findIndex((t) => t.id === 'music'), 1);
  const [tool, setTool] = useState<Tool>(tools[0].id);
  const [edit, setEdit] = useState<PostEdit>(initial ?? {});
  const set = (patch: Partial<PostEdit>) => setEdit((e) => ({ ...e, ...patch }));

  const player = useVideoPlayer(isVideo ? uri : null, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [thumbs, setThumbs] = useState<{ t: number; img: VideoThumbnail }[]>([]);
  const [editing, setEditing] = useState<TextItem | null>(null);
  useEditPlayback(player, edit, !editing, sound);

  // durée réelle + images de la vidéo (barre de coupe, filtres, couverture)
  useEffect(() => {
    if (!isVideo) return;
    let done = false;
    const load = async () => {
      if (done || player.status !== 'readyToPlay') return;
      done = true;
      const d = player.duration || knownDuration || 0;
      setDuration(d);
      const times = Array.from({ length: 10 }, (_, i) => (d * (i + 0.5)) / 10);
      try {
        const imgs = await player.generateThumbnailsAsync(times, { maxWidth: 160 });
        setThumbs(imgs.map((img, i) => ({ t: times[i], img })));
      } catch {}
    };
    load();
    const sub = player.addListener('statusChange', load);
    return () => sub.remove();
  }, [player, isVideo, knownDuration]);

  // aperçu : cadre 9:16 qui tient dans l'écran
  const panelH = 150;
  const availH = sh - insets.top - insets.bottom - 56 - panelH - 60 - 8;
  // Duo : les deux cases prennent toute la largeur ; sinon un cadre vertical le plus grand possible
  const frameW = duo ? sw - 12 : Math.min(sw - 16, availH * (9 / 16));
  const frameH = duo ? availH : frameW * (16 / 9);

  const start = edit.start ?? 0;
  const end = edit.end ?? (duration ? Math.min(duration, MAX) : 0);

  const finish = () => {
    const out: PostEdit = { ...edit };
    if (!out.start) delete out.start;
    if (out.end === undefined || (duration && out.end >= duration - 0.05)) delete out.end;
    if (out.volume === undefined || out.volume >= 0.99) delete out.volume;
    if (!out.music) delete out.music;
    if (!out.texts?.length) delete out.texts;
    if (!out.filter || out.filter === 'none') delete out.filter;
    onDone(out);
  };

  const saveText = (t: TextItem) => {
    const list = edit.texts ?? [];
    const exists = list.some((x) => x.id === t.id);
    set({ texts: t.text.trim() ? (exists ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]) : list.filter((x) => x.id !== t.id) });
    setEditing(null);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.headBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headTitle}>Modifier</Text>
        <Pressable onPress={finish} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
          <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.next}>
            <Text style={styles.nextText}>Suivant</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* aperçu */}
      <View style={styles.stage}>
        <View style={[styles.frame, { width: frameW, height: frameH }]}>
          {isVideo && duo ? (
            <DuoFrame
              layout={duo.layout}
              width={frameW}
              height={frameH}
              pseudo={duo.pseudo}
              original={<DuoSource duo={duo} own={player} active={!editing} />}
              me={<VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />}
            />
          ) : isVideo ? (
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          ) : (
            <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" />
          )}
          <FilterLayer id={edit.filter} />
          {(edit.texts ?? []).map((t) =>
            editing?.id === t.id ? null : (
              <DraggableText
                key={t.id}
                item={t}
                w={frameW}
                h={frameH}
                onMove={(x, y) => set({ texts: (edit.texts ?? []).map((u) => (u.id === t.id ? { ...u, x, y } : u)) })}
                onTap={() => setEditing(t)}
              />
            ),
          )}
          {isVideo && tool === 'cut' && duration > 0 && (
            <View style={styles.timeBadge}>
              <Text style={styles.timeBadgeText}>{Math.round(end - start)} s</Text>
            </View>
          )}
        </View>
      </View>

      {/* réglages de l'outil choisi */}
      <View style={[styles.panel, { height: panelH }]}>
        {tool === 'cut' && <CutTool duration={duration} start={start} end={end} thumbs={thumbs} onChange={(s, e) => set({ start: s, end: e })} />}
        {tool === 'sound' &&
          (sound ? (
            // son repris (Duo, « Utiliser ce son ») : deux réglages séparés
            <View style={styles.pad}>
              <Row icon="mic" label={duo ? 'Ma voix' : 'Mon micro'} value={edit.volume ?? 1} />
              <GoldSlider value={edit.volume ?? 1} onChange={(v) => set({ volume: Math.round(v * 20) / 20 })} />
              <Row
                icon="musical-notes"
                label={duo ? 'Vidéo originale' : 'Son choisi'}
                value={sound.trackId ? (edit.music?.volume ?? 1) : (edit.soundVolume ?? 1)}
              />
              <GoldSlider
                value={sound.trackId ? (edit.music?.volume ?? 1) : (edit.soundVolume ?? 1)}
                onChange={(v) => {
                  const r = Math.round(v * 20) / 20;
                  if (sound.trackId) set({ music: { id: sound.trackId, volume: r } });
                  else set({ soundVolume: r });
                }}
              />
            </View>
          ) : (
            <View style={styles.pad}>
              <Row icon="volume-high" label="Son de la vidéo" value={edit.volume ?? 1} />
              <GoldSlider value={edit.volume ?? 1} onChange={(v) => set({ volume: Math.round(v * 20) / 20 })} />
              <Text style={styles.hint}>{edit.music ? 'Baisse le son de la vidéo pour que la musique ressorte.' : 'Mets 0 % pour couper le son et garder seulement une musique.'}</Text>
            </View>
          ))}
        {tool === 'music' && (
          <View style={styles.pad}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip on={!edit.music} label="Aucune" sub="Son d’origine" onPress={() => set({ music: null })} />
              {TRACKS.map((t) => (
                <Chip
                  key={t.id}
                  on={edit.music?.id === t.id}
                  label={t.name}
                  sub={t.mood.charAt(0).toUpperCase() + t.mood.slice(1)}
                  icon="musical-note"
                  onPress={() => {
                    tap();
                    set({ music: { id: t.id, volume: edit.music?.volume ?? 0.8 }, volume: isVideo ? Math.min(edit.volume ?? 1, 0.4) : undefined });
                  }}
                />
              ))}
            </ScrollView>
            {edit.music && (
              <>
                <Row icon="musical-notes" label="Volume de la musique" value={edit.music.volume} />
                <GoldSlider value={edit.music.volume} onChange={(v) => set({ music: { ...edit.music!, volume: Math.round(v * 20) / 20 } })} />
              </>
            )}
          </View>
        )}
        {tool === 'text' && (
          <View style={[styles.pad, { alignItems: 'center', justifyContent: 'center' }]}>
            <Pressable
              onPress={() => {
                tap();
                setEditing({ id: `t${Date.now()}`, text: '', x: 0.5, y: 0.4, color: '#FFFFFF', bg: false, size: 0.075 });
              }}
            >
              <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addText}>
                <Ionicons name="add" size={20} color={colors.bg} />
                <Text style={styles.addTextLabel}>Ajouter un texte</Text>
              </LinearGradient>
            </Pressable>
            <Text style={[styles.hint, { textAlign: 'center', marginTop: 12 }]}>
              {(edit.texts?.length ?? 0) > 0 ? 'Fais glisser un texte pour le placer. Touche-le pour le modifier.' : 'Ajoute un titre, une question, un sous-titre…'}
            </Text>
          </View>
        )}
        {tool === 'filter' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, padding: 16 }}>
            {FILTERS.map((f) => {
              const on = (edit.filter ?? 'none') === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => {
                    tap();
                    set({ filter: f.id });
                  }}
                  style={{ alignItems: 'center' }}
                >
                  <View style={[styles.filterThumb, on && styles.filterOn]}>
                    <Image source={isVideo ? (thumbs[2]?.img ?? thumbs[0]?.img) : uri} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <FilterLayer id={f.id} />
                  </View>
                  <Text style={[styles.filterName, on && { color: colors.gold }]}>{f.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        {tool === 'cover' && (
          <View style={styles.pad}>
            <Text style={styles.hint}>Choisis l’image qui s’affichera sur ton profil et dans les grilles.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
              {thumbs.map((th) => {
                const on = Math.abs((edit.cover ?? thumbs[0]?.t ?? 0) - th.t) < 0.01;
                return (
                  <Pressable
                    key={th.t}
                    onPress={() => {
                      tap();
                      set({ cover: th.t });
                      try {
                        player.currentTime = th.t;
                      } catch {}
                    }}
                  >
                    <Image source={th.img} style={[styles.coverThumb, on && styles.filterOn]} contentFit="cover" />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>

      {/* outils */}
      <View style={[styles.tabs, { paddingBottom: insets.bottom + 6 }]}>
        {tools.map((t) => {
          const on = tool === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                tap();
                setTool(t.id);
              }}
              style={styles.tab}
            >
              <Ionicons name={t.icon} size={22} color={on ? colors.gold : colors.text} />
              <Text style={[styles.tabLabel, on && { color: colors.gold }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {editing && <TextEditor item={editing} width={frameW} onDone={saveText} onCancel={() => setEditing(null)} />}
    </View>
  );
}

// ── Couper : barre d'images + deux poignées ──

function CutTool({
  duration,
  start,
  end,
  thumbs,
  onChange,
}: {
  duration: number;
  start: number;
  end: number;
  thumbs: { t: number; img: VideoThumbnail }[];
  onChange: (start: number, end: number) => void;
}) {
  const [w, setW] = useState(1);
  const live = useRef({ start, end, duration, w, onChange });
  live.current = { start, end, duration, w, onChange };
  const grab = useRef({ start: 0, end: 0 });

  const handle = (which: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        grab.current = { start: live.current.start, end: live.current.end };
        Haptics.selectionAsync().catch(() => {});
      },
      onPanResponderMove: (_, g) => {
        const { duration: d, w: width, onChange: cb } = live.current;
        if (!d) return;
        const dt = (g.dx / width) * d;
        if (which === 'start') {
          const s = Math.min(Math.max(0, grab.current.start + dt), grab.current.end - 1);
          cb(Math.round(s * 10) / 10, Math.min(grab.current.end, s + MAX));
        } else {
          const e = Math.max(Math.min(d, grab.current.end + dt), grab.current.start + 1);
          cb(Math.max(grab.current.start, e - MAX), Math.round(e * 10) / 10);
        }
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const left = useMemo(() => handle('start'), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const right = useMemo(() => handle('end'), []);

  if (!duration) return <Text style={[styles.hint, { padding: 16 }]}>Chargement de la vidéo…</Text>;
  const a = (start / duration) * w;
  const b = (end / duration) * w;
  return (
    <View style={styles.pad}>
      <View style={styles.cutLabels}>
        <Text style={styles.cutLabel}>Début {fmt(start)}</Text>
        <Text style={[styles.cutLabel, { color: colors.gold }]}>{Math.round(end - start)} s</Text>
        <Text style={styles.cutLabel}>Fin {fmt(end)}</Text>
      </View>
      <View style={styles.strip} onLayout={(e) => setW(e.nativeEvent.layout.width || 1)}>
        <View style={styles.stripImgs}>
          {thumbs.map((th) => (
            <Image key={th.t} source={th.img} style={{ flex: 1, height: '100%' }} contentFit="cover" />
          ))}
        </View>
        <View pointerEvents="none" style={[styles.dim, { left: 0, width: a }]} />
        <View pointerEvents="none" style={[styles.dim, { left: b, right: 0 }]} />
        <View pointerEvents="none" style={[styles.window, { left: a, width: Math.max(0, b - a) }]} />
        <View {...left.panHandlers} hitSlop={{ left: 16, right: 16, top: 10, bottom: 10 }} style={[styles.handle, { left: a - 12 }]}>
          <View style={styles.handleBar} />
        </View>
        <View {...right.panHandlers} hitSlop={{ left: 16, right: 16, top: 10, bottom: 10 }} style={[styles.handle, { left: b - 12 }]}>
          <View style={styles.handleBar} />
        </View>
      </View>
      <Text style={styles.hint}>Fais glisser les poignées dorées pour garder le meilleur moment (60 s max).</Text>
    </View>
  );
}

// ── Texte déplaçable sur l'aperçu ──

function DraggableText({ item, w, h, onMove, onTap }: { item: TextItem; w: number; h: number; onMove: (x: number, y: number) => void; onTap: () => void }) {
  const live = useRef({ item, w, h, onMove, onTap });
  live.current = { item, w, h, onMove, onTap };
  const from = useRef({ x: 0, y: 0 });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        from.current = { x: live.current.item.x, y: live.current.item.y };
      },
      onPanResponderMove: (_, g) => {
        const { w: W, h: H, onMove: move } = live.current;
        move(Math.min(0.95, Math.max(0.05, from.current.x + g.dx / W)), Math.min(0.95, Math.max(0.05, from.current.y + g.dy / H)));
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4) live.current.onTap();
      },
    }),
  ).current;
  return (
    <View style={[styles.placed, { left: item.x * w, top: item.y * h }]}>
      <View style={styles.placedCenter}>
        <View {...pan.panHandlers}>
          <TextBubble item={item} width={w} />
        </View>
      </View>
    </View>
  );
}

// ── Saisie d'un texte ──

function TextEditor({ item, width, onDone, onCancel }: { item: TextItem; width: number; onDone: (t: TextItem) => void; onCancel: () => void }) {
  const [t, setT] = useState(item);
  const sizes = [
    { v: 0.055, label: 'Petit' },
    { v: 0.075, label: 'Moyen' },
    { v: 0.1, label: 'Grand' },
  ];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.textEditor}>
      <View style={styles.textEditorTop}>
        <Pressable onPress={onCancel} hitSlop={10}>
          <Text style={styles.textEditorBtn}>Annuler</Text>
        </Pressable>
        {item.text ? (
          <Pressable onPress={() => onDone({ ...t, text: '' })} hitSlop={10}>
            <Ionicons name="trash-outline" size={22} color="#F07167" />
          </Pressable>
        ) : null}
        <Pressable onPress={() => onDone(t)} hitSlop={10}>
          <Text style={[styles.textEditorBtn, { color: colors.gold }]}>OK</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
        <View style={[styles.bubbleInput, t.bg && { backgroundColor: t.color === '#111111' ? '#FFFFFF' : 'rgba(0,0,0,0.55)' }]}>
          <TextInput
            value={t.text}
            onChangeText={(v) => setT({ ...t, text: v.slice(0, 120) })}
            autoFocus
            multiline
            placeholder="Écris ici…"
            placeholderTextColor="rgba(255,255,255,0.5)"
            style={[styles.textInput, { color: t.color, fontSize: Math.max(18, width * t.size * 1.15) }]}
          />
        </View>
      </View>
      <View style={styles.textTools}>
        <Pressable onPress={() => setT({ ...t, bg: !t.bg })} style={[styles.bgBtn, t.bg && { backgroundColor: colors.text }]}>
          <Text style={[styles.bgBtnText, t.bg && { color: colors.bg }]}>A</Text>
        </Pressable>
        {TEXT_COLORS.map((c) => (
          <Pressable key={c} onPress={() => setT({ ...t, color: c })} style={[styles.swatch, { backgroundColor: c }, t.color === c && styles.swatchOn]} />
        ))}
      </View>
      <View style={[styles.textTools, { paddingBottom: 14 }]}>
        {sizes.map((s) => (
          <Pressable key={s.v} onPress={() => setT({ ...t, size: s.v })} style={[styles.sizeBtn, Math.abs(t.size - s.v) < 0.001 && styles.sizeOn]}>
            <Text style={[styles.sizeText, Math.abs(t.size - s.v) < 0.001 && { color: colors.bg }]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── petits éléments ──

function Row({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={colors.gold} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{Math.round(value * 100)} %</Text>
    </View>
  );
}

function Chip({ on, label, sub, icon, onPress }: { on: boolean; label: string; sub?: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      {icon && <Ionicons name={icon} size={16} color={on ? colors.bg : colors.gold} />}
      <View>
        <Text style={[styles.chipLabel, on && { color: colors.bg }]}>{label}</Text>
        {!!sub && <Text style={[styles.chipSub, on && { color: 'rgba(10,8,6,0.7)' }]}>{sub}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  head: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  next: { height: 36, paddingHorizontal: 18, borderRadius: 18, justifyContent: 'center' },
  nextText: { color: colors.bg, fontSize: 15, fontWeight: '900' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#111' },
  timeBadge: { position: 'absolute', top: 10, alignSelf: 'center', paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
  timeBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  panel: { backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pad: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  hint: { color: colors.textDim, fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  tabs: { flexDirection: 'row', backgroundColor: colors.bg, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabLabel: { color: colors.text, fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  rowLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700' },
  rowValue: { color: colors.gold, fontSize: 14, fontWeight: '800' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 48, borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  chipSub: { color: colors.textFaint, fontSize: 11 },
  addText: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, height: 46, borderRadius: 23 },
  addTextLabel: { color: colors.bg, fontSize: 15.5, fontWeight: '900' },
  filterThumb: { width: 64, height: 86, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface2, borderWidth: 2, borderColor: 'transparent' },
  filterOn: { borderColor: colors.gold },
  filterName: { color: colors.text, fontSize: 11.5, fontWeight: '700', marginTop: 5 },
  coverThumb: { width: 54, height: 80, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  cutLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cutLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  strip: { height: 58, borderRadius: 8 },
  stripImgs: { flexDirection: 'row', height: '100%', borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface2 },
  dim: { position: 'absolute', top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  window: { position: 'absolute', top: -2, bottom: -2, borderWidth: 3, borderColor: colors.gold, borderRadius: 6 },
  handle: { position: 'absolute', top: -6, bottom: -6, width: 24, alignItems: 'center', justifyContent: 'center' },
  handleBar: { width: 10, height: '100%', borderRadius: 4, backgroundColor: colors.goldLight, borderWidth: 1, borderColor: colors.bg },
  placed: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  placedCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center', width: 600 },
  textEditor: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)' },
  textEditorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 70 },
  textEditorBtn: { color: colors.text, fontSize: 17, fontWeight: '800' },
  bubbleInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '100%' },
  textInput: { fontWeight: '900', textAlign: 'center', minWidth: 120 },
  textTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  bgBtn: { width: 34, height: 34, borderRadius: 8, borderWidth: 2, borderColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  bgBtnText: { color: colors.text, fontSize: 18, fontWeight: '900' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  swatchOn: { borderColor: colors.gold, borderWidth: 3, transform: [{ scale: 1.15 }] },
  sizeBtn: { paddingHorizontal: 16, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  sizeOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  sizeText: { color: colors.text, fontSize: 13, fontWeight: '800' },
});
