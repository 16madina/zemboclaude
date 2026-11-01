import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { deleteDoc, doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

// Compte Zembo (Firebase Auth) + fiche utilisateur (Firestore : users/{uid})

export type ZemboProfile = {
  uid: string;
  nom: string;
  prenom: string;
  pseudo: string;
  email: string;
  pays: string;
  telephone: string;
};

export type SignUpData = Omit<ZemboProfile, 'uid'> & { password: string };

type Ctx = {
  user: User | null;
  profile: ZemboProfile | null;
  loading: boolean;
  signUp: (d: SignUpData) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Ouvre l'écran de connexion si besoin, puis lance `then` une fois connecté */
  requireAuth: (reason: string, then?: () => void) => void;
  authPrompt: { reason: string } | null;
  closeAuth: (success: boolean) => void;
};

const SessionCtx = createContext<Ctx | null>(null);

export const normalizePseudo = (v: string) =>
  v
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 20);

/** Message en français pour une erreur Firebase */
export function authError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const msg = (e as { message?: string })?.message ?? '';
  if (msg === 'pseudo-pris') return 'Ce pseudo est déjà pris. Choisis-en un autre.';
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Cet email est déjà utilisé. Connecte-toi plutôt.';
    case 'auth/invalid-email':
      return "Cette adresse email n'est pas valide.";
    case 'auth/weak-password':
      return 'Mot de passe trop court (6 caractères minimum).';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email ou mot de passe incorrect.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    case 'auth/network-request-failed':
      return 'Pas de connexion internet.';
    case 'auth/requires-recent-login':
      return 'Pour des raisons de sécurité, reconnecte-toi puis réessaie.';
    case 'auth/missing-email':
      return 'Indique ton adresse email.';
    default:
      return "Une erreur est survenue. Réessaie.";
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<ZemboProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authPrompt, setAuthPrompt] = useState<{ reason: string } | null>(null);
  const after = useRef<(() => void) | null>(null);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (!u) {
          setProfile(null);
          setLoading(false);
        }
      }),
    [],
  );

  // fiche utilisateur en temps réel
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? ({ uid: user.uid, ...snap.data() } as ZemboProfile) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [user]);

  const signUp = useCallback(async (d: SignUpData) => {
    const pseudo = normalizePseudo(d.pseudo);
    // vérification rapide avant de créer le compte
    const taken = await getDoc(doc(db, 'usernames', pseudo));
    if (taken.exists()) throw new Error('pseudo-pris');

    const cred = await createUserWithEmailAndPassword(auth, d.email.trim(), d.password);
    try {
      await runTransaction(db, async (tx) => {
        const nameRef = doc(db, 'usernames', pseudo);
        if ((await tx.get(nameRef)).exists()) throw new Error('pseudo-pris');
        tx.set(nameRef, { uid: cred.user.uid });
        tx.set(doc(db, 'users', cred.user.uid), {
          nom: d.nom.trim(),
          prenom: d.prenom.trim(),
          pseudo,
          email: d.email.trim(),
          pays: d.pays,
          telephone: d.telephone.trim(),
          createdAt: serverTimestamp(),
        });
      });
      await updateProfile(cred.user, { displayName: `${d.prenom.trim()} ${d.nom.trim()}` });
    } catch (e) {
      // le pseudo a été pris entre-temps : on annule le compte créé
      await deleteUser(cred.user).catch(() => {});
      throw e;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signOut = useCallback(() => fbSignOut(auth), []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  // Suppression complète du compte (exigée par l'App Store)
  const deleteAccount = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    // Firebase n'accepte la suppression que si la connexion date de moins de 5 minutes :
    // on le vérifie avant d'effacer quoi que ce soit.
    const last = Date.parse(u.metadata.lastSignInTime ?? '');
    if (!last || Date.now() - last > 4.5 * 60 * 1000) throw Object.assign(new Error('recent'), { code: 'auth/requires-recent-login' });
    const snap = await getDoc(doc(db, 'users', u.uid));
    const pseudo = snap.exists() ? (snap.data().pseudo as string) : null;
    const world = await getDoc(doc(db, 'worldProfiles', u.uid));
    const worldName = world.exists() ? (world.data().username as string | undefined) : undefined;
    // les données d'abord (il faut encore être connecté pour les effacer), puis le compte
    await Promise.allSettled([
      deleteDoc(doc(db, 'worldProfiles', u.uid)),
      worldName ? deleteDoc(doc(db, 'worldUsernames', worldName)) : Promise.resolve(),
      pseudo ? deleteDoc(doc(db, 'usernames', pseudo)) : Promise.resolve(),
    ]);
    await deleteDoc(doc(db, 'users', u.uid)).catch(() => {});
    await deleteUser(u);
  }, []);

  const requireAuth = useCallback((reason: string, then?: () => void) => {
    if (auth.currentUser) {
      then?.();
      return;
    }
    after.current = then ?? null;
    setAuthPrompt({ reason });
  }, []);

  const closeAuth = useCallback((success: boolean) => {
    setAuthPrompt(null);
    const fn = after.current;
    after.current = null;
    if (success && fn) setTimeout(fn, 450);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ user, profile, loading, signUp, signIn, signOut, resetPassword, deleteAccount, requireAuth, authPrompt, closeAuth }),
    [user, profile, loading, signUp, signIn, signOut, resetPassword, deleteAccount, requireAuth, authPrompt, closeAuth],
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession hors de SessionProvider');
  return c;
}
