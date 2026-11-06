import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, goldGradient } from '../theme';
import { auth } from '../lib/firebase';
import { useSession } from '../lib/session';
import { COMPRESS_END, hashtagsOf, publishPost, type MediaKind } from './posts';
import { useTagSuggestions } from './hashtags';
import { EditorScreen } from './EditorScreen';
import { FilterLayer, TextsLayer, useEditPlayback, type PostEdit } from './edit';
import type { DuoRef, SoundRef } from './sounds';
import { DuoFrame, DuoSource } from './duo';

// Publier une vidéo ou une photo sur l'accueil :
// 1. choisir dans la galerie ou filmer / photographier
// 2. aperçu + légende (#hashtags)
// 3. envoi avec barre de progression

const MAX_SECONDS = 60;
const MAX_CAPTION = 300;

type Picked = { uri: string; width: number; height: number; duration: number | null };

/** Vidéo déjà filmée dans Zembo (avec un son repris ou en Duo) */
export type PublishPreset = { picked: Picked; edit?: PostEdit; soundRef?: SoundRef; duo?: DuoRef };

export function PublishScreen({
  kind,
  initialCaption = '',
  initialTags = [],
  preset,
  onClose,
  onPublished,
}: {
  kind: MediaKind | null;
  /** légende de départ (ex. « #zembochallenge » depuis la page d'un hashtag) */
  initialCaption?: string;
  /** hashtags de départ (ex. depuis la page d'un hashtag) */
  initialTags?: string[];
  preset?: PublishPreset;
  onClose: () => void;
  onPublished: () => void;
}) {
  return (
    <Modal visible={kind !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{kind && <Body kind={kind} initialCaption={initialCaption} initialTags={initialTags} preset={preset} onClose={onClose} onPublished={onPublished} />}</SafeAreaProvider>
    </Modal>
  );
}

function Body({
  kind,
  initialCaption,
  initialTags,
  preset,
  onClose,
  onPublished,
}: {
  kind: MediaKind;
  initialCaption: string;
  initialTags: string[];
  preset?: PublishPreset;
  onClose: () => void;
  onPublished: () => void;
}) {
  const insets = useSafeAreaInsets();
  const sw = useWindowDimensions().width;
  const { profile } = useSession();
  const [picked, setPicked] = useState<Picked | null>(preset?.picked ?? null);
  const [edit, setEdit] = useState<PostEdit>(preset?.edit ?? {});
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(initialCaption);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagText, setTagText] = useState('');
  const [tagFocus, setTagFocus] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const isVideo = kind === 'video';
  const signedIn = !!auth.currentUser;

  const pick = async (from: 'library' | 'camera') => {
    try {
      if (from === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Caméra non autorisée', 'Autorise la caméra pour Zembo dans les Réglages de ton téléphone.');
          return;
        }
      }
      const opts: ImagePicker.ImagePickerOptions = isVideo
        ? {
            mediaTypes: ['videos'],
            allowsEditing: true,
            videoMaxDuration: MAX_SECONDS,
            videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
            videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
          }
        : { mediaTypes: ['images'], quality: 0.9 };
      const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const a = res.canceled ? null : res.assets[0];
      if (!a) return;
      const seconds = a.duration ? a.duration / 1000 : null;
      if (isVideo && seconds && seconds > MAX_SECONDS + 1) {
        Alert.alert('Vidéo trop longue', `Ta vidéo fait ${Math.round(seconds)} secondes. Coupe-la à ${MAX_SECONDS} secondes maximum.`);
        return;
      }
      setPicked({ uri: a.uri, width: a.width, height: a.height, duration: seconds });
      setEdit({});
      // on passe directement par l'éditeur
      setEditing(true);
    } catch {
      Alert.alert('Oups', 'Impossible d’ouvrir ce fichier. Réessaie avec un autre.');
    }
  };

  const send = async () => {
    if (!picked || progress !== null) return;
    Keyboard.dismiss();
    setProgress(0);
    try {
      await publishPost(
        {
          kind,
          ...picked,
          edit,
          soundRef: preset?.soundRef,
          duo: preset?.duo,
          caption,
          hashtags: [...new Set([...tags, ...hashtagsOf(caption)])].slice(0, 10),
          pseudo: profile?.pseudo || 'membre',
          name: [profile?.prenom, profile?.nom].filter(Boolean).join(' ') || profile?.pseudo || 'Membre Zembo',
        },
        setProgress,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onPublished();
    } catch (e) {
      setProgress(null);
      const msg = (e as { code?: string })?.code ?? '';
      Alert.alert(
        'Publication impossible',
        msg.includes('unauthorized')
          ? 'Ton compte n’a pas le droit d’envoyer ce fichier. Reconnecte-toi puis réessaie.'
          : msg.includes('network') || msg.includes('retry-limit')
            ? 'La connexion internet a coupé pendant l’envoi. Réessaie.'
            : 'Une erreur est survenue pendant l’envoi. Réessaie.',
      );
    }
  };

  const close = () => {
    if (progress !== null) return;
    if (picked) {
      Alert.alert('Abandonner ?', isVideo ? 'Ta vidéo ne sera pas publiée.' : 'Ta photo ne sera pas publiée.', [
        { text: 'Continuer', style: 'cancel' },
        { text: 'Abandonner', style: 'destructive', onPress: onClose },
      ]);
    } else onClose();
  };

  // hashtags : champ à part ; on tape le mot, il s'ajoute en dessous
  const addTag = (raw: string) => {
    const t = raw.replace(/^#+/, '').toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 40);
    if (!t) return;
    setTags((list) => (list.includes(t) || list.length >= 10 ? list : [...list, t]));
    setTagText('');
  };
  // les propositions s'affichent sous le champ : on fait défiler pour les montrer au-dessus du clavier
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const scrollDown = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 250);
  const typedTag = tagText.replace(/^#+/, '').toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');
  // en tapant : hashtags qui commencent pareil ; champ vide : les plus populaires
  const suggestions = useTagSuggestions(tagFocus ? typedTag : null).filter((t) => !tags.includes(t.tag));

  if (picked && editing) {
    return (
      <EditorScreen
        kind={kind}
        uri={picked.uri}
        duration={picked.duration}
        initial={edit}
        lockedSound={preset?.soundRef?.title ?? (preset?.duo ? `Duo avec @${preset.duo.pseudo}` : undefined)}
        duo={preset?.duo}
        sound={preset?.soundRef}
        onBack={() => setEditing(false)}
        onDone={(e) => {
          setEdit(e);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Pressable onPress={close} hitSlop={10} style={styles.headBtn}>
          <Ionicons name={picked ? 'chevron-back' : 'close'} size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headTitle}>{isVideo ? 'Publier une vidéo' : 'Publier une photo'}</Text>
        <View style={styles.headBtn} />
      </View>

      {!signedIn ? (
        <View style={styles.center}>
          <Ionicons name="person-circle-outline" size={56} color={colors.gold} />
          <Text style={styles.bigTitle}>Crée ton compte pour publier</Text>
          <Text style={styles.bigSub}>Tu es en mode test sans compte. Inscris-toi pour que tes vidéos et tes photos apparaissent sur l’accueil.</Text>
        </View>
      ) : !picked ? (
        <View style={[styles.center, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={styles.bigTitle}>{isVideo ? 'Ta vidéo, ton moment' : 'Partage ta photo'}</Text>
          <Text style={styles.bigSub}>{isVideo ? `Format vertical conseillé, ${MAX_SECONDS} secondes maximum.` : 'Elle apparaîtra sur l’accueil et sur ton profil.'}</Text>
          <Source icon="images" title="Choisir dans la galerie" sub={isVideo ? 'Tu pourras couper ta vidéo' : 'Une photo de ton téléphone'} onPress={() => pick('library')} />
          <Source icon={isVideo ? 'videocam' : 'camera'} title={isVideo ? 'Filmer maintenant' : 'Prendre une photo'} sub="Avec l’appareil photo" onPress={() => pick('camera')} />
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <View style={[styles.preview, preset?.duo && { width: sw - 32, height: (sw - 32) * 0.9 }]}>
              {isVideo ? <VideoPreview uri={picked.uri} edit={edit} duo={preset?.duo} /> : <Image source={picked.uri} style={StyleSheet.absoluteFill} contentFit="cover" />}
              <FilterLayer id={edit.filter} />
              <TextsLayer texts={edit.texts} width={preset?.duo ? sw - 32 : 200} height={preset?.duo ? (sw - 32) * 0.9 : 356} />
              <Pressable onPress={() => setEditing(true)} style={styles.modify} disabled={progress !== null}>
                <Ionicons name="color-wand" size={15} color={colors.bg} />
                <Text style={styles.modifyText}>Modifier</Text>
              </Pressable>
              <Pressable onPress={() => setPicked(null)} style={[styles.change, !!preset && { display: 'none' }]} disabled={progress !== null}>
                <Ionicons name="swap-horizontal" size={15} color="#fff" />
                <Text style={styles.changeText}>Changer</Text>
              </Pressable>
              {isVideo && !!picked.duration && (
                <View style={styles.duration}>
                  <Text style={styles.changeText}>{Math.round((edit.end ?? picked.duration) - (edit.start ?? 0))} s</Text>
                </View>
              )}
            </View>

            <Text style={styles.label}>LÉGENDE</Text>
            <TextInput
              value={caption}
              onChangeText={(t) => setCaption(t.slice(0, MAX_CAPTION))}
              placeholder="Dis quelque chose sur ta vidéo…"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              multiline
              editable={progress === null}
            />
            <Text style={[styles.count, { textAlign: 'right', marginTop: 6 }]}>
              {caption.length}/{MAX_CAPTION}
            </Text>

            <Text style={styles.label}>HASHTAGS</Text>
            <View style={styles.tagInputBox}>
              <Text style={styles.tagHash}>#</Text>
              <TextInput
                value={tagText}
                onChangeText={(t) => {
                  // espace ou virgule : les mots tapés deviennent des hashtags, le dernier reste en cours
                  const parts = t.split(/[\s,]+/);
                  const last = parts.pop() ?? '';
                  parts.forEach(addTag);
                  setTagText(last.slice(0, 40));
                  scrollDown();
                }}
                onSubmitEditing={() => addTag(tagText)}
                onFocus={() => {
                  setTagFocus(true);
                  scrollDown();
                }}
                onBlur={() => setTagFocus(false)}
                blurOnSubmit={false}
                returnKeyType="done"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={tags.length >= 10 ? '10 hashtags maximum' : 'Tape un mot, ex. danse'}
                placeholderTextColor={colors.textFaint}
                style={styles.tagInput}
                editable={progress === null && tags.length < 10}
              />
              {!!typedTag && (
                <Pressable onPress={() => addTag(tagText)} hitSlop={8} style={styles.tagAdd}>
                  <Ionicons name="add" size={18} color={colors.bg} />
                </Pressable>
              )}
            </View>

            {/* propositions : populaires ou qui commencent pareil, avec le nombre de vidéos */}
            {tagFocus && (suggestions.length > 0 || typedTag.length > 0) && (
              <View style={styles.suggestBox}>
                <Text style={styles.tagBoxTitle}>{typedTag ? 'Propositions' : 'Hashtags populaires'}</Text>
                {typedTag.length > 0 && !suggestions.some((t) => t.tag === typedTag) && (
                  <Pressable onPress={() => addTag(typedTag)} style={styles.suggestRow}>
                    <Text style={styles.suggestTag}>#{typedTag}</Text>
                    <Text style={styles.suggestCount}>Nouveau hashtag</Text>
                  </Pressable>
                )}
                {suggestions.slice(0, 6).map((t) => (
                  <Pressable key={t.tag} onPress={() => addTag(t.tag)} style={styles.suggestRow}>
                    <Text style={styles.suggestTag}>#{t.tag}</Text>
                    <Text style={styles.suggestCount}>
                      {t.count} vidéo{t.count > 1 ? 's' : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* hashtags ajoutés */}
            {tags.length > 0 && (
              <View style={styles.chips}>
                {tags.map((t) => (
                  <Pressable key={t} onPress={() => setTags((l) => l.filter((x) => x !== t))} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>#{t}</Text>
                    <Ionicons name="close" size={14} color={colors.textDim} />
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.note}>
              <Ionicons name="earth" size={16} color={colors.gold} />
              <Text style={styles.noteText}>Publique : visible par tout le monde sur l’accueil et sur ton profil.</Text>
            </View>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
            {progress === null ? (
              <Pressable onPress={send} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
                <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                  <Ionicons name="paper-plane" size={18} color={colors.bg} />
                  <Text style={styles.ctaText}>Publier</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={styles.sending}>
                <View style={styles.sendingRow}>
                  <ActivityIndicator color={colors.gold} />
                  <Text style={styles.sendingText}>
                    {isVideo && progress < COMPRESS_END
                      ? `Compression… ${Math.round((progress / COMPRESS_END) * 100)} %`
                      : progress < 0.95
                        ? `Envoi… ${Math.round(((progress - (isVideo ? COMPRESS_END : 0)) / (0.95 - (isVideo ? COMPRESS_END : 0))) * 100)} %`
                        : 'Presque fini…'}
                  </Text>
                </View>
                <View style={styles.track}>
                  <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.fill, { width: `${Math.max(4, progress * 100)}%` }]} />
                </View>
                <Text style={styles.sendingSub}>Garde l’app ouverte pendant l’envoi.</Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function VideoPreview({ uri, edit, duo }: { uri: string; edit: PostEdit; duo?: DuoRef }) {
  const duoW = useWindowDimensions().width - 32;
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.1;
    p.play();
  });
  // aperçu muet : on garde la coupe, pas la musique
  useEditPlayback(player, { start: edit.start, end: edit.end }, true);
  const me = <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
  if (duo) return <DuoFrame layout={duo.layout} width={duoW} height={duoW * 0.9} pseudo={duo.pseudo} original={<DuoSource duo={duo} own={player} active />} me={me} />;
  return me;
}

function Source({ icon, title, sub, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.source, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}>
      <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sourceIcon}>
        <Ionicons name={icon} size={26} color={colors.bg} />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text style={styles.sourceTitle}>{title}</Text>
        <Text style={styles.sourceSub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 50 },
  headBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, gap: 12 },
  bigTitle: { color: colors.text, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  bigSub: { color: colors.textDim, fontSize: 14.5, textAlign: 'center', marginBottom: 14, lineHeight: 20 },
  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.35)',
  },
  sourceIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  sourceTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  sourceSub: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  preview: {
    alignSelf: 'center',
    width: 200,
    height: 356,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1.5,
    borderColor: 'rgba(212,175,55,0.6)',
  },
  change: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modify: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gold,
  },
  modifyText: { color: colors.bg, fontSize: 12.5, fontWeight: '900' },
  changeText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  duration: { position: 'absolute', bottom: 10, left: 10, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginTop: 20, marginBottom: 8 },
  input: {
    minHeight: 96,
    maxHeight: 160,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    padding: 14,
    paddingTop: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  inputFoot: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 10 },
  tags: { flex: 1, color: colors.gold, fontSize: 13, fontWeight: '700' },
  count: { color: colors.textFaint, fontSize: 12 },
  tagBox: { marginTop: 12 },
  tagBoxTitle: { color: colors.textDim, fontSize: 12, fontWeight: '800', marginBottom: 8 },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: 'rgba(212,175,55,0.5)',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tagInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagHash: { color: colors.gold, fontSize: 20, fontWeight: '900', marginRight: 6 },
  tagInput: { flex: 1, color: colors.text, fontSize: 16 },
  tagAdd: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  suggestBox: { marginTop: 8, padding: 12, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  suggestRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  suggestTag: { color: colors.gold, fontSize: 15.5, fontWeight: '800' },
  suggestCount: { color: colors.textFaint, fontSize: 12.5 },
  tagChipNew: { borderColor: 'rgba(212,175,55,0.6)', borderStyle: 'dashed' },
  tagChipText: { color: colors.gold, fontSize: 14, fontWeight: '800' },
  tagChipCount: { color: colors.textFaint, fontSize: 11, marginTop: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: 'rgba(212,175,55,0.08)' },
  noteText: { flex: 1, color: colors.textDim, fontSize: 13, lineHeight: 18 },
  footer: { paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  cta: { height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: colors.bg, fontSize: 18, fontWeight: '900' },
  sending: { paddingVertical: 4 },
  sendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  sendingText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: 'hidden', marginTop: 12 },
  fill: { height: '100%', borderRadius: 4 },
  sendingSub: { color: colors.textFaint, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
