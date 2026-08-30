export const FREIGHTER_DOWNLOAD_URL = "https://www.freighter.app/";

export type FreighterHost = {
  freighter?: unknown;
  freighterApi?: unknown;
  stellar?: { provider?: string; platform?: string };
};

export function isFreighterInjected(win?: FreighterHost | null): boolean {
  if (!win) return false;
  if (win.freighter || win.freighterApi) return true;
  // Freighter mobile injects window.stellar instead of window.freighter.
  return win.stellar?.provider === "freighter";
}

export function isFreighterMobile(win?: FreighterHost | null): boolean {
  return win?.stellar?.provider === "freighter" && win.stellar?.platform === "mobile";
}

export function currentFreighterHost(): FreighterHost | undefined {
  if (typeof window === "undefined") return undefined;
  return window as FreighterHost;
}
