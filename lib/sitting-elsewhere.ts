'use client';

import { useSyncExternalStore } from 'react';

/**
 * The last snapshot read off the server that names a sitting running on
 * another device, as stored, or null. Written by LiveSittingSync, which reads
 * the server; read by ElsewhereDock, which offers to take the sitting over and
 * works its figures out to the second from the snapshot itself.
 */

let current: unknown = null;
let signature = 'null';
const listeners = new Set<() => void>();

export function setSittingElsewhere(raw: unknown): void {
  const next = raw == null ? 'null' : JSON.stringify(raw);
  if (next === signature) return;
  signature = next;
  current = raw ?? null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSittingElsewhere(): unknown {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
