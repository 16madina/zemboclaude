import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';
import { deleteObject, getStorage, ref } from 'firebase/storage';
import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy';
import { ImageFormat, Skia, type SkImage } from '@shopify/react-native-skia';
import { File, Paths } from 'expo-file-system';
import { app, auth, db } from '../lib/firebase';
import type { Post } from '../data/feed';
import type { PostEdit } from './edit';

// Publications des membres (vidéos et photos) :
// - le fichier et sa miniature vont dans Firebase Storage (posts/{uid}/{id}/…)
// - la fiche de la publication va dans Firestore (posts/{id})

const storage = getStorage(app);
const DEFAULT_AVATAR = require('../../assets/icon.png');

export type MediaKind = 'video' | 'photo';

export type PostDoc = {
  uid: string;
  kind: MediaKind;
  url: string;
  thumb: string | null;
  width: number;
  height: number;
  duration: number | null;
  caption: string;
  hashtags: string[];
  pseudo: string;
  name: string;
  createdAt: { toMillis: () => number } | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  edit?: PostEdit;
};

/** Fiche Firestore -> publication affichable dans le fil */
export function toPost(id: string, d: DocumentData): Post {
  const p = d as PostDoc;
  return {
    id,
    kind: p.kind === 'photo' ? 'photo' : 'video',
    video: p.kind === 'video' ? p.url : '',
    image: p.kind === 'photo' ? p.url : undefined,
    thumb: p.thumb ?? undefined,
    uid: p.uid,
    createdAt: p.createdAt?.toMillis() ?? Date.now(),
    user: { handle: p.pseudo, name: p.name || p.pseudo, avatar: DEFAULT_AVATAR },
    // les #hashtags sont affichés à part (cliquables) : on les retire du texte
    caption: (p.caption ?? '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/\s{2,}/g, ' ').trim(),
    hashtags: p.hashtags ?? [],
    sound: p.kind === 'photo' ? `Photo de ${p.pseudo}` : `son original - ${p.pseudo}`,
    likes: p.likes ?? 0,
    comments: p.comments ?? 0,
    saves: p.saves ?? 0,
    shares: p.shares ?? 0,
    edit: p.edit ?? undefined,
  };
}

/** Les dernières publications de tout le monde, en temps réel */
export function useFeedPosts(max = 50) {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(max)),
        (snap) => setPosts(snap.docs.map((s) => toPost(s.id, s.data()))),
        () => {},
      ),
    [max],
  );
  return posts;
}

/** Les publications d'un membre, de la plus récente à la plus ancienne */
export function useUserPosts(uid: string | null | undefined) {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'posts'), where('uid', '==', uid), limit(200)),
      (snap) =>
        setPosts(
          snap.docs.map((s) => toPost(s.id, s.data())).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
        ),
      () => {},
    );
  }, [uid]);
  return uid ? posts : [];
}

/** Mots-dièse écrits dans la légende (#zembo) */
export function hashtagsOf(caption: string) {
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  return [...new Set(tags.map((t) => t.slice(1).toLowerCase()))].slice(0, 10);
}

// ── Images (redimensionnement et miniatures avec Skia) ──

function drawResized(img: SkImage, maxW: number, rotation = 0) {
  const rotated = rotation === 90 || rotation === 270;
  const srcW = img.width();
  const srcH = img.height();
  const outW0 = rotated ? srcH : srcW;
  const outH0 = rotated ? srcW : srcH;
  const scale = Math.min(1, maxW / outW0);
  const w = Math.round(outW0 * scale);
  const h = Math.round(outH0 * scale);
  const surface = Skia.Surface.Make(w, h);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.save();
  canvas.translate(w / 2, h / 2);
  canvas.rotate(rotation, 0, 0);
  const dw = (rotated ? h : w) / 2;
  const dh = (rotated ? w : h) / 2;
  const paint = Skia.Paint();
  canvas.drawImageRect(img, Skia.XYWHRect(0, 0, srcW, srcH), Skia.XYWHRect(-dw, -dh, dw * 2, dh * 2), paint);
  canvas.restore();
  surface.flush();
  const out = surface.makeImageSnapshot();
  return { bytes: out.encodeToBytes(ImageFormat.JPEG, 82), width: w, height: h };
}

async function photoFiles(uri: string) {
  const img = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!img) throw new Error('image-illisible');
  const main = drawResized(img, 1080);
  const thumb = drawResized(img, 360);
  if (!main) throw new Error('image-illisible');
  return { main, thumb };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function videoThumb(uri: string, atMs = 300) {
  try {
    const video = await Skia.Video(uri);
    video.seek(Math.max(0, atMs));
    let frame: SkImage | null = null;
    for (let i = 0; i < 30 && !frame; i++) {
      frame = video.nextImage();
      if (!frame) await wait(60);
    }
    if (!frame) return null;
    return drawResized(frame, 360, video.rotation());
  } catch {
    return null;
  }
}

// ── Compression vidéo (≈ 2,8 Mb/s, 1280 px max) ──

/** Avant l'envoi : une vidéo de 40 s passe d'environ 50 Mo à environ 12 Mo, sans perte visible.
 *  Sans le module (Expo Go, ancienne version de l'app), on envoie la vidéo telle quelle. */
async function compressVideo(uri: string, onProgress?: (r: number) => void) {
  try {
    // chargé à la demande : le module natif n'existe que dans les versions récentes de l'app
    const { Video } = require('react-native-compressor') as typeof import('react-native-compressor');
    const out = await Video.compress(
      uri,
      { compressionMethod: 'manual', bitrate: 2_800_000, maxSize: 1280, minimumFileSizeForCompress: 6, progressDivider: 5 },
      (r) => onProgress?.(r),
    );
    return out.startsWith('file://') ? out : `file://${out}`;
  } catch {
    return uri;
  }
}

// ── Envoi ──

async function tempFile(bytes: Uint8Array, name: string) {
  const f = new File(Paths.cache, `${Date.now()}-${name}`);
  await f.write(bytes);
  return f.uri;
}

const BUCKET = 'zembo-claude.firebasestorage.app';

/** Envoie un fichier du téléphone vers Firebase Storage (directement depuis le disque) et renvoie son lien */
async function upload(path: string, fileUri: string, contentType: string, onProgress?: (r: number) => void) {
  const user = auth.currentUser;
  if (!user) throw new Error('non-connecte');
  const token = await user.getIdToken();
  const task = createUploadTask(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`,
    fileUri,
    {
      httpMethod: 'POST',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { Authorization: `Firebase ${token}`, 'Content-Type': contentType },
    },
    (p) => onProgress?.(p.totalBytesExpectedToSend > 0 ? p.totalBytesSent / p.totalBytesExpectedToSend : 0),
  );
  const res = await task.uploadAsync();
  if (!res || res.status >= 300) {
    throw Object.assign(new Error(`envoi-${res?.status ?? 'coupe'}`), {
      code: res?.status === 403 || res?.status === 401 ? 'storage/unauthorized' : res ? 'storage/unknown' : 'storage/network',
    });
  }
  const meta = JSON.parse(res.body) as { downloadTokens?: string };
  const dl = String(meta.downloadTokens ?? '').split(',')[0];
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${dl}`;
}

export const COMPRESS_END = 0.35;

export type NewPost = {
  kind: MediaKind;
  uri: string;
  width: number;
  height: number;
  /** en secondes */
  duration: number | null;
  caption: string;
  pseudo: string;
  name: string;
  /** montage (éditeur) */
  edit?: PostEdit;
};

/** Envoie le fichier (vidéo compressée), sa miniature, puis crée la publication. onProgress va de 0 à 1.
 *  Pour une vidéo, de 0 à 0,35 c'est la compression (COMPRESS_END). */
export async function publishPost(p: NewPost, onProgress?: (r: number) => void) {
  const user = auth.currentUser;
  if (!user) throw new Error('non-connecte');
  const id = doc(collection(db, 'posts')).id;
  const base = `posts/${user.uid}/${id}`;
  onProgress?.(0.02);

  let url: string;
  let thumb: string | null = null;
  let width = p.width;
  let height = p.height;

  if (p.kind === 'photo') {
    const { main, thumb: t } = await photoFiles(p.uri);
    width = main.width;
    height = main.height;
    url = await upload(`${base}/photo.jpg`, await tempFile(main.bytes, 'photo.jpg'), 'image/jpeg', (r) => onProgress?.(0.05 + r * 0.85));
    if (t) thumb = await upload(`${base}/thumb.jpg`, await tempFile(t.bytes, 'thumb.jpg'), 'image/jpeg');
  } else {
    const t = await videoThumb(p.uri, ((p.edit?.cover ?? p.edit?.start ?? 0.3) as number) * 1000);
    // 0 → 0,35 : compression ; 0,35 → 0,95 : envoi
    const light = await compressVideo(p.uri, (r) => onProgress?.(0.02 + r * 0.33));
    onProgress?.(0.35);
    url = await upload(`${base}/video.mp4`, light, 'video/mp4', (r) => onProgress?.(0.35 + r * 0.55));
    if (t) thumb = await upload(`${base}/thumb.jpg`, await tempFile(t.bytes, 'thumb.jpg'), 'image/jpeg');
  }
  onProgress?.(0.95);

  await setDoc(doc(db, 'posts', id), {
    uid: user.uid,
    kind: p.kind,
    url,
    thumb,
    width,
    height,
    duration: p.edit?.end !== undefined || p.edit?.start ? Math.max(1, (p.edit?.end ?? p.duration ?? 0) - (p.edit?.start ?? 0)) : p.duration,
    ...(p.edit && Object.keys(p.edit).length ? { edit: p.edit } : {}),
    caption: p.caption.trim().slice(0, 300),
    hashtags: hashtagsOf(p.caption),
    pseudo: p.pseudo,
    name: p.name,
    createdAt: serverTimestamp(),
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
  });
  onProgress?.(1);
  return id;
}

/** Supprime une de mes publications (fiche + fichiers) */
export async function deletePost(post: Post) {
  const user = auth.currentUser;
  if (!user || post.uid !== user.uid) return;
  await deleteDoc(doc(db, 'posts', post.id));
  const base = `posts/${user.uid}/${post.id}`;
  const files = post.kind === 'photo' ? ['photo.jpg', 'thumb.jpg'] : ['video.mp4', 'thumb.jpg'];
  await Promise.allSettled(files.map((f) => deleteObject(ref(storage, `${base}/${f}`))));
}
