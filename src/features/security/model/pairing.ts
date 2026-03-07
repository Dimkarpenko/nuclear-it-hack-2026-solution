import * as Crypto from "expo-crypto";

import {
  PairingAcceptance,
  PairingInvite,
  PairingInvitePayload,
} from "./types";
import { DeviceIdentity } from "./types";

const TOKEN_PREFIX = "hexpair:";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const WORDS = [
  "amber",
  "atlas",
  "beacon",
  "cedar",
  "cipher",
  "delta",
  "ember",
  "falcon",
  "globe",
  "harbor",
  "ion",
  "juniper",
  "kepler",
  "lotus",
  "matrix",
  "nova",
  "onyx",
  "pixel",
  "quartz",
  "raven",
  "signal",
  "tangent",
  "ultra",
  "vector",
  "whisper",
  "xenon",
  "yonder",
  "zenith",
];

async function sha256(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function normalizeCodePhrase(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function randomWord(): string {
  const index = Math.floor(Math.random() * WORDS.length);
  return WORDS[index];
}

function makeCodePhrase(): string {
  return [randomWord(), randomWord(), randomWord(), randomWord()].join(" ");
}

function encodePayload(payload: PairingInvitePayload): string {
  return `${TOKEN_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodePayload(token: string): PairingInvitePayload {
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new Error("Invalid pairing token format");
  }

  const encoded = token.slice(TOKEN_PREFIX.length);
  const decoded = decodeURIComponent(encoded);
  const payload = JSON.parse(decoded) as PairingInvitePayload;

  if (!payload.deviceId || !payload.publicKey || !payload.challenge) {
    throw new Error("Invalid pairing token content");
  }

  return payload;
}

async function buildChallenge(
  deviceId: string,
  publicKey: string,
  nonce: string,
  issuedAt: number,
  expiresAt: number,
  codePhrase: string,
): Promise<string> {
  const plain = [
    "1",
    deviceId,
    publicKey,
    nonce,
    String(issuedAt),
    String(expiresAt),
    normalizeCodePhrase(codePhrase),
  ].join("|");

  return sha256(plain);
}

export function getFingerprint(publicKey: string): string {
  const compact = publicKey.slice(0, 20).toUpperCase();
  return compact.match(/.{1,4}/g)?.join("-") ?? compact;
}

export async function createPairingInvite(
  identity: DeviceIdentity,
  ttlMs = DEFAULT_TTL_MS,
): Promise<PairingInvite> {
  const codePhrase = makeCodePhrase();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + ttlMs;
  const nonce = (await sha256(`${Math.random()}-${issuedAt}`)).slice(0, 16);
  const challenge = await buildChallenge(
    identity.deviceId,
    identity.publicKey,
    nonce,
    issuedAt,
    expiresAt,
    codePhrase,
  );

  const payload: PairingInvitePayload = {
    version: 1,
    deviceId: identity.deviceId,
    displayName: identity.displayName,
    publicKey: identity.publicKey,
    nonce,
    issuedAt,
    expiresAt,
    challenge,
  };

  return {
    token: encodePayload(payload),
    codePhrase,
    fingerprint: getFingerprint(identity.publicKey),
    expiresAt,
    payload,
  };
}

export async function acceptPairingInvite(
  token: string,
  codePhrase: string,
  now = Date.now(),
): Promise<PairingAcceptance> {
  const payload = decodePayload(token);

  if (now > payload.expiresAt) {
    throw new Error("Pairing token expired");
  }

  const expected = await buildChallenge(
    payload.deviceId,
    payload.publicKey,
    payload.nonce,
    payload.issuedAt,
    payload.expiresAt,
    codePhrase,
  );

  if (expected !== payload.challenge) {
    throw new Error("Pairing code phrase is incorrect");
  }

  return {
    peerId: payload.deviceId,
    displayName: payload.displayName,
    publicKey: payload.publicKey,
    fingerprint: getFingerprint(payload.publicKey),
  };
}

export async function createPrivateChatId(
  a: string,
  b: string,
): Promise<string> {
  const ordered = [a, b].sort().join("|");
  return (await sha256(`chat:${ordered}`)).slice(0, 24);
}
