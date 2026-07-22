import { useSyncExternalStore } from 'react';
import { db, getRevision, subscribe } from './store/db';

export function useDB() {
  useSyncExternalStore(subscribe, getRevision, getRevision);
  return db;
}
