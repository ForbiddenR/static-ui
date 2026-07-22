import { useSyncExternalStore } from 'react';
import { db, subscribe } from './store/db';

export function useDB() {
  useSyncExternalStore(subscribe, () => db);
  return db;
}
