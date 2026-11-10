/** window.GfSDK 접근 헬퍼(번들된 classic script 가 전역에 올린다). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GfSDKLike = any;

export function sdk(): GfSDKLike | null {
  return (globalThis as any).GfSDK ?? null;
}

export function gfLog(name: string, data?: Record<string, unknown>) {
  try {
    const g = sdk();
    if (g?.log) Promise.resolve(g.log(name, data)).catch(() => {});
  } catch { /* ignore */ }
}
