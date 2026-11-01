// Le paquet @firebase/auth publie cette fonction seulement dans sa version React Native ;
// ses types par défaut (web) ne la déclarent pas. On l'ajoute ici.
import type { Persistence } from '@firebase/auth';

declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string | null>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
