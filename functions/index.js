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

  // le premier qui ouvre la salle en devient l'hôte
  const db = getFirestore();
  const ref = db.doc(`lives/${room}`);
  const live = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data();
    const created = { host: uid, stage: [], createdAt: FieldValue.serverTimestamp() };
    tx.set(ref, created);
    return created;
  });
  const onStage = live.host === uid || (Array.isArray(live.stage) && live.stage.includes(uid));

  const at = new AccessToken(LIVEKIT_API_KEY.value(), LIVEKIT_API_SECRET.value(), { identity: uid, name, ttl: '3h' });
  at.addGrant({ room, roomJoin: true, canSubscribe: true, canPublish: onStage, canPublishData: true });
  return { url: LIVEKIT_URL, token: await at.toJwt(), onStage, host: live.host === uid };
});
