import { createContext } from 'react';

/**
 * Where the hero jelly's bell is right now, as shares of the scene (`r` as a
 * share of its width). The jelly can be taken hold of and thrown, so the
 * ocean round it cannot assume it hangs where it was put: `OceanScene`
 * provides one of these and `StudyFan` writes the bell into it every frame,
 * for the light it casts in the deep and anything that comes to look at it.
 */
export interface JellyAt {
  x: number;
  y: number;
  r: number;
}

export const JellyAtContext = createContext<{ current: JellyAt | null } | null>(null);
