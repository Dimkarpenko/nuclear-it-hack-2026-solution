import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

const DEFAULT_RELAY_PORT = 8787;
const PROBE_TIMEOUT_MS = 900;

function normalizeHost(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  if (
    value.startsWith("ws://") ||
    value.startsWith("wss://") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    try {
      const url = new URL(value);
      return url.hostname || null;
    } catch {
      return null;
    }
  }

  const noPath = value.split("/")[0];
  const host = noPath.split(":")[0];
  return host || null;
}

function toRelayUrl(host: string, port = DEFAULT_RELAY_PORT): string {
  return `ws://${host}:${port}`;
}

function getHostFromScriptUrl(): string | null {
  const sourceCode = (NativeModules as { SourceCode?: { scriptURL?: string } })
    .SourceCode;
  const scriptUrl = sourceCode?.scriptURL;
  if (!scriptUrl) {
    return null;
  }

  return normalizeHost(scriptUrl);
}

function getHostFromExpoConstants(): string | null {
  const values = [
    (Constants as unknown as { expoConfig?: { hostUri?: string } }).expoConfig
      ?.hostUri,
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } })
      .expoGoConfig?.debuggerHost,
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest
      ?.debuggerHost,
    (
      Constants as unknown as {
        manifest2?: { extra?: { expoClient?: { hostUri?: string } } };
      }
    ).manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const value of values) {
    if (!value) {
      continue;
    }

    const host = normalizeHost(value);
    if (host) {
      return host;
    }
  }

  return null;
}

function getHostFromWebLocation(): string | null {
  const maybeGlobal = globalThis as { location?: { hostname?: string } };
  return maybeGlobal.location?.hostname ?? null;
}

function extractHostFromRelayUrl(
  relayUrl: string | null | undefined,
): string | null {
  if (!relayUrl) {
    return null;
  }

  return normalizeHost(relayUrl);
}

function collectCandidateHosts(relayHint?: string | null): string[] {
  const set = new Set<string>();

  const hintHost = extractHostFromRelayUrl(relayHint);
  if (hintHost) {
    set.add(hintHost);
  }

  const scriptHost = getHostFromScriptUrl();
  if (scriptHost) {
    set.add(scriptHost);
  }

  const constantsHost = getHostFromExpoConstants();
  if (constantsHost) {
    set.add(constantsHost);
  }

  if (Platform.OS === "web") {
    const webHost = getHostFromWebLocation();
    if (webHost) {
      set.add(webHost);
    }
  }

  return Array.from(set);
}

function probeRelayUrl(
  url: string,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;

    const finish = (
      result: boolean,
      socket?: WebSocket,
      timer?: ReturnType<typeof setTimeout>,
    ) => {
      if (done) {
        return;
      }
      done = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (socket) {
        try {
          socket.close();
        } catch {
          return resolve(result);
        }
      }
      resolve(result);
    };

    try {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => finish(false, socket, timer), timeoutMs);

      socket.onopen = () => finish(true, socket, timer);
      socket.onerror = () => finish(false, socket, timer);
      socket.onclose = () => finish(false, undefined, timer);
    } catch {
      finish(false);
    }
  });
}

export async function detectRelayUrl(
  relayHint?: string | null,
): Promise<string | null> {
  const hosts = collectCandidateHosts(relayHint);

  for (const host of hosts) {
    const url = toRelayUrl(host);
    const ok = await probeRelayUrl(url);
    if (ok) {
      return url;
    }
  }

  return null;
}
