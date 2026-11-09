import type * as THREE from 'three';

/**
 * The animal builder, one THREE.Group per cell, head first (root > animated > content, as PieceView drives it). The game
 * entry (experiments/2-5d-game/vite.config.ts) resolves `./cards` to experiments/2-5d-game/spriteCards.ts, which draws
 * the 2.5D picture cards; this file only types that import for tsc.
 */
export function buildAnimal(species: string, cells: number): THREE.Group[];
