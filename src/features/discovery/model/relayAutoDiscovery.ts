import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

const DEFAULT_RELAY_PORT = 8787;
const PROBE_TIMEOUT_MS = 900;

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "0.0.0.0"
  ) {
    return true;
  }

  return normalized.startsWith("127.");
}

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
    (
      Constants as unknown as {
        expoConfig?: { extra?: { lanRelayHost?: string; relayHost?: string } };
      }
    ).expoConfig?.extra?.lanRelayHost,
    (
      Constants as unknown as {
        expoConfig?: { extra?: { lanRelayHost?: string; relayHost?: string } };
      }
    ).expoConfig?.extra?.relayHost,
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
  const addHost = (host: string | null, allowLoopback = false) => {
    if (!host) {
      return;
    }

    if (!allowLoopback && isLoopbackHost(host)) {
      return;
    }

    set.add(host);
  };

  const hintHost = extractHostFromRelayUrl(relayHint);
  addHost(hintHost, true);

  const scriptHost = getHostFromScriptUrl();
  addHost(scriptHost);

  const constantsHost = getHostFromExpoConstants();
  addHost(constantsHost);

  if (Platform.OS === "web") {
    const webHost = getHostFromWebLocation();
    addHost(webHost);
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
