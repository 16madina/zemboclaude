// Fonctions serveur de Zembo (Firebase Cloud Functions).
//
// livekitToken : donne à un membre connecté son code d'accès à la salle vidéo d'un live (LiveKit).
// - L'hôte du live et les joueurs sur scène peuvent envoyer leur caméra et leur micro.
// - Tous les autres sont spectateurs : ils voient et entendent, sans rien envoyer.
// La liste des joueurs sur scène est dans Firestore (lives/{salle}.stage) et seul l'hôte peut la changer.
// Les clés LiveKit sont des secrets Firebase : elles ne sont jamais dans l'app.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { AccessToken } = require('livekit-server-sdk');

initializeApp();

const LIVEKIT_API_KEY = defineSecret('LIVEKIT_API_KEY');
const LIVEKIT_API_SECRET = defineSecret('LIVEKIT_API_SECRET');
const LIVEKIT_URL = 'wss://zembo-natif-xkioeu01.livekit.cloud';

exports.livekitToken = onCall({ region: 'europe-west1', secrets: [LIVEKIT_API_KEY, LIVEKIT_API_SECRET] }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connecte-toi pour rejoindre le live.');

  const room = String(req.data?.room ?? '');
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(room)) throw new HttpsError('invalid-argument', 'Nom de salle invalide.');
  const name = String(req.data?.name ?? '').slice(0, 40);

  // l'hôte est écrit dans le nom de la salle (format-uid) : un spectateur arrivé avant lui
  // ne peut pas prendre sa place
  const db = getFirestore();
  const ref = db.doc(`lives/${room}`);
  const dash = room.indexOf('-');
  const owner = dash > 0 ? room.slice(dash + 1) : uid;
  const live = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data();
    const created = { host: owner, stage: [], createdAt: FieldValue.serverTimestamp() };
    tx.set(ref, created);
    return created;
  });
  const onStage = live.host === uid || (Array.isArray(live.stage) && live.stage.includes(uid));

  const at = new AccessToken(LIVEKIT_API_KEY.value(), LIVEKIT_API_SECRET.value(), { identity: uid, name, ttl: '3h' });
  at.addGrant({ room, roomJoin: true, canSubscribe: true, canPublish: onStage, canPublishData: true });
  return { url: LIVEKIT_URL, token: await at.toJwt(), onStage, host: live.host === uid };
});

// ── Compteurs (j'aime, commentaires, enregistrements, abonnés) ──
// L'app écrit seulement « qui aime quoi » ; le serveur tient les chiffres à jour,
// pour qu'ils ne puissent pas être truqués depuis un téléphone.

const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');

const REGION = 'europe-west1'; // la base Firestore est en Europe (eur3)
const on = (path) => ({ document: path, region: REGION });

/** Ajoute n au compteur d'une publication (et au total de j'aime de son auteur) */
async function bumpPost(postId, field, n) {
  const db = getFirestore();
  const ref = db.doc(`posts/${postId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update({ [field]: FieldValue.increment(n) });
  if (field === 'likes') {
    await db.doc(`profiles/${snap.data().uid}`).set({ likes: FieldValue.increment(n) }, { merge: true });
  }
}

exports.likeAdded = onDocumentCreated(on('posts/{postId}/likes/{uid}'), (e) => bumpPost(e.params.postId, 'likes', 1));
exports.likeRemoved = onDocumentDeleted(on('posts/{postId}/likes/{uid}'), (e) => bumpPost(e.params.postId, 'likes', -1));
exports.commentAdded = onDocumentCreated(on('posts/{postId}/comments/{cid}'), (e) => bumpPost(e.params.postId, 'comments', 1));
exports.commentRemoved = onDocumentDeleted(on('posts/{postId}/comments/{cid}'), (e) => bumpPost(e.params.postId, 'comments', -1));
exports.saveAdded = onDocumentCreated(on('users/{uid}/saved/{postId}'), (e) => bumpPost(e.params.postId, 'saves', 1));
exports.saveRemoved = onDocumentDeleted(on('users/{uid}/saved/{postId}'), (e) => bumpPost(e.params.postId, 'saves', -1));

/** Abonnement : users/{uid}/followers/{fid} = fid suit uid */
async function bumpFollow(uid, fid, n) {
  const db = getFirestore();
  await Promise.all([
    db.doc(`profiles/${uid}`).set({ followers: FieldValue.increment(n) }, { merge: true }),
    db.doc(`profiles/${fid}`).set({ following: FieldValue.increment(n) }, { merge: true }),
  ]);
}
exports.followAdded = onDocumentCreated(on('users/{uid}/followers/{fid}'), (e) => bumpFollow(e.params.uid, e.params.fid, 1));
exports.followRemoved = onDocumentDeleted(on('users/{uid}/followers/{fid}'), (e) => bumpFollow(e.params.uid, e.params.fid, -1));

// ── Hashtags : hashtags/{tag} = nombre de publications qui l'utilisent ──

const TAG = /^[\p{L}\p{N}_]{1,40}$/u;
async function bumpTags(tags, n) {
  const db = getFirestore();
  const list = [...new Set((Array.isArray(tags) ? tags : []).filter((t) => typeof t === 'string' && TAG.test(t)))].slice(0, 10);
  await Promise.all(
    list.map((t) =>
      db.doc(`hashtags/${t}`).set(
        n > 0 ? { count: FieldValue.increment(n), lastAt: FieldValue.serverTimestamp() } : { count: FieldValue.increment(n) },
        { merge: true },
      ),
    ),
  );
}
exports.postAdded = onDocumentCreated(on('posts/{postId}'), (e) => bumpTags(e.data?.data()?.hashtags, 1));

/** Publication supprimée : on efface ses j'aime et commentaires, on retire ses j'aime du total de l'auteur
 *  et on décompte ses hashtags */
exports.postRemoved = onDocumentDeleted(on('posts/{postId}'), async (e) => {
  const db = getFirestore();
  const data = e.data?.data();
  await db.recursiveDelete(db.doc(`posts/${e.params.postId}`));
  await bumpTags(data?.hashtags, -1);
  if (data?.uid && data.likes > 0) {
    await db.doc(`profiles/${data.uid}`).set({ likes: FieldValue.increment(-data.likes) }, { merge: true });
  }
});

// ── Lives en cours (onAir/{salle}) : nombre de spectateurs, ménage à la fin du live ──

async function bumpViewers(room, n) {
  try {
    await getFirestore().doc(`onAir/${room}`).update({ viewers: FieldValue.increment(n) });
  } catch {
    // le live est déjà terminé
  }
}
exports.viewerJoined = onDocumentCreated(on('onAir/{room}/viewers/{uid}'), (e) => bumpViewers(e.params.room, 1));
exports.viewerLeft = onDocumentDeleted(on('onAir/{room}/viewers/{uid}'), (e) => bumpViewers(e.params.room, -1));

/** Live terminé : on efface son chat et sa liste de spectateurs */
// (seulement les sous-collections : si l'hôte relance aussitôt, son nouveau live reste en place)
exports.liveEnded = onDocumentDeleted(on('onAir/{room}'), async (e) => {
  const db = getFirestore();
  await db.recursiveDelete(db.collection(`onAir/${e.params.room}/chat`));
  await db.recursiveDelete(db.collection(`onAir/${e.params.room}/viewers`));
});

/** Compte supprimé : on efface aussi sa fiche publique */
exports.userRemoved = onDocumentDeleted(on('users/{uid}'), (e) => getFirestore().doc(`profiles/${e.params.uid}`).delete());
