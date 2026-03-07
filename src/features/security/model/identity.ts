import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { DeviceIdentity } from "./types";

const IDENTITY_KEY = "hex.device.identity.v1";
const GENERATED_NAME_PREFIX = "Node-";

async function sha256(value: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
}

function normalizeDisplayName(
  displayName: string | undefined,
  fallbackId: string,
): string {
  const safe = (displayName ?? "").trim();
  if (safe.length > 0) {
    return safe.slice(0, 40);
  }

  return `Node-${fallbackId.slice(0, 6)}`;
}

function isGeneratedDisplayName(
  displayName: string,
  deviceId: string,
): boolean {
  return displayName === `${GENERATED_NAME_PREFIX}${deviceId.slice(0, 6)}`;
}

export function isProfileNameRequired(identity: DeviceIdentity): boolean {
  const safe = identity.displayName.trim();
  if (safe.length === 0) {
    return true;
  }

  if (identity.isProfileCompleted === true) {
    return false;
  }

  if (identity.isProfileCompleted === false) {
    return true;
  }

  return isGeneratedDisplayName(safe, identity.deviceId);
}

async function createNewIdentity(
  displayName?: string,
): Promise<DeviceIdentity> {
  const entropy = `${Date.now()}-${Math.random()}-${Math.random()}-${Math.random()}`;
  const seed = await sha256(entropy);
  const privateKey = await sha256(`hex-private:${seed}`);
  const publicKey = await sha256(`hex-public:${privateKey}`);
  const deviceId = (await sha256(`hex-device:${publicKey}`)).slice(0, 24);
  const now = Date.now();

  return {
    deviceId,
    displayName: normalizeDisplayName(displayName, deviceId),
    isProfileCompleted: Boolean(displayName && displayName.trim().length > 0),
    publicKey,
    privateKey,
    createdAt: now,
    updatedAt: now,
  };
}

async function saveIdentity(identity: DeviceIdentity): Promise<void> {
  await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
}

export async function getDeviceIdentity(): Promise<DeviceIdentity | null> {
  const raw = await SecureStore.getItemAsync(IDENTITY_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as DeviceIdentity;
  } catch {
    return null;
  }
}

export async function getOrCreateDeviceIdentity(
  displayName?: string,
): Promise<DeviceIdentity> {
  const existing = await getDeviceIdentity();
  if (existing) {
    if (
      displayName &&
      displayName.trim() &&
      displayName.trim() !== existing.displayName
    ) {
      const updated: DeviceIdentity = {
        ...existing,
        displayName: normalizeDisplayName(displayName, existing.deviceId),
        isProfileCompleted: true,
        updatedAt: Date.now(),
      };
      await saveIdentity(updated);
      return updated;
    }

    return existing;
  }

  const created = await createNewIdentity(displayName);
  await saveIdentity(created);
  return created;
}

export async function updateDeviceDisplayName(
  displayName: string,
): Promise<DeviceIdentity> {
  const identity = await getOrCreateDeviceIdentity(displayName);

  const updated: DeviceIdentity = {
    ...identity,
    displayName: normalizeDisplayName(displayName, identity.deviceId),
    isProfileCompleted: true,
    updatedAt: Date.now(),
  };

  await saveIdentity(updated);
  return updated;
}
