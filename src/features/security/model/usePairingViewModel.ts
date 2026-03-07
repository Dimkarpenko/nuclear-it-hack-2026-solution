import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";

import { Chat, Peer } from "@/entities/messenger";
import { upsertChat } from "@/entities/chat";
import { listPeers, upsertPeer } from "@/entities/peer";

import { getOrCreateDeviceIdentity, updateDeviceDisplayName } from "./identity";
import {
  acceptPairingInvite,
  createPairingInvite,
  createPrivateChatId,
} from "./pairing";
import { PairingInvite } from "./types";

export function usePairingViewModel() {
  const [isBusy, setIsBusy] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [publicFingerprint, setPublicFingerprint] = useState("");
  const [invite, setInvite] = useState<PairingInvite | null>(null);
  const [remoteToken, setRemoteToken] = useState("");
  const [remoteCode, setRemoteCode] = useState("");
  const [peers, setPeers] = useState<Peer[]>([]);

  const refresh = useCallback(async () => {
    const [identity, knownPeers] = await Promise.all([
      getOrCreateDeviceIdentity(),
      listPeers(),
    ]);

    setDeviceId(identity.deviceId);
    setDeviceName(identity.displayName);
    setPublicFingerprint(identity.publicKey.slice(0, 20).toUpperCase());
    setPeers(knownPeers);
  }, []);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const saveName = async () => {
    setIsBusy(true);
    try {
      const identity = await updateDeviceDisplayName(deviceName);
      setDeviceName(identity.displayName);
      Alert.alert("Saved", "Device name updated");
    } catch {
      Alert.alert("Error", "Unable to update device name");
    } finally {
      setIsBusy(false);
    }
  };

  const generateInvite = async () => {
    setIsBusy(true);
    try {
      const identity = await getOrCreateDeviceIdentity(deviceName);
      const nextInvite = await createPairingInvite(identity);
      setInvite(nextInvite);
      Alert.alert(
        "Invite ready",
        "Share token and code phrase via separate channels",
      );
    } catch {
      Alert.alert("Error", "Unable to generate invite");
    } finally {
      setIsBusy(false);
    }
  };

  const copyInviteToken = async () => {
    if (!invite) {
      return;
    }

    await Clipboard.setStringAsync(invite.token);
    Alert.alert("Copied", "Invite token copied");
  };

  const copyInviteCode = async () => {
    if (!invite) {
      return;
    }

    await Clipboard.setStringAsync(invite.codePhrase);
    Alert.alert("Copied", "Code phrase copied");
  };

  const acceptInvite = async () => {
    setIsBusy(true);

    try {
      const identity = await getOrCreateDeviceIdentity();
      const acceptance = await acceptPairingInvite(
        remoteToken.trim(),
        remoteCode.trim(),
      );

      if (acceptance.peerId === identity.deviceId) {
        throw new Error("Self pairing is not allowed");
      }

      const now = Date.now();
      const peer: Peer = {
        id: acceptance.peerId,
        displayName: acceptance.displayName,
        publicKey: acceptance.publicKey,
        trustLevel: 100,
        isBlocked: false,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      };

      await upsertPeer(peer);

      const chat: Chat = {
        id: await createPrivateChatId(identity.deviceId, peer.id),
        type: "private",
        participantPeerId: peer.id,
        title: peer.displayName,
        createdAt: now,
        updatedAt: now,
        lastMessageAt: null,
      };

      await upsertChat(chat);
      await refresh();
      setRemoteToken("");
      setRemoteCode("");
      Alert.alert("Paired", `Trusted peer added: ${acceptance.displayName}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to accept invite";
      Alert.alert("Pairing failed", message);
    } finally {
      setIsBusy(false);
    }
  };

  return {
    isBusy,
    deviceName,
    setDeviceName,
    deviceId,
    publicFingerprint,
    invite,
    remoteToken,
    setRemoteToken,
    remoteCode,
    setRemoteCode,
    peers,
    saveName,
    generateInvite,
    copyInviteToken,
    copyInviteCode,
    acceptInvite,
  };
}
