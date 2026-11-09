import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * What build a running game is (A1, 2026-11-07): the commit, branch and dirty state of the code, and a hash of the
 * level data it ships, so every playtest record and screenshot can be tied to exactly what was played. Computed when
 * the vite config loads (restart the dev server after a commit to refresh it); the game shows it in a corner and the
 * play log stores it with every attempt.
 */
export interface BuildInfo {
  commit: string;
  branch: string;
  dirty: boolean;
  /** first 8 hex of the md5 of src/curve/levels.json */
  levels: string;
  builtAt: string;
}

const git = (args: string): string => { try { return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; } };

export function buildInfo(root: string): BuildInfo {
  let levels = 'unknown';
  try { levels = createHash('md5').update(readFileSync(`${root}/src/curve/levels.json`)).digest('hex').slice(0, 8); } catch { /* no level data */ }
  return {
    commit: git('rev-parse --short HEAD'),
    branch: git('branch --show-current'),
    dirty: git('status --porcelain') !== '',
    levels,
    builtAt: new Date().toISOString(),
  };
}

/** The `define` entry for a vite config: the game reads `__BUILD_INFO__`. */
export const buildDefine = (root: string): Record<string, string> => ({ __BUILD_INFO__: JSON.stringify(buildInfo(root)) });
