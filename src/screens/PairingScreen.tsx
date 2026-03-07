import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";

import { Chat, Peer } from "../domain/models";
import {
  acceptPairingInvite,
  createPairingInvite,
  createPrivateChatId,
  getOrCreateDeviceIdentity,
  PairingInvite,
  updateDeviceDisplayName,
} from "../security";
import { upsertChat, upsertPeer, listPeers } from "../storage/repositories";

export function PairingScreen() {
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
      Alert.alert("Invite ready", "Share token and code phrase via separate channels");
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
      const acceptance = await acceptPairingInvite(remoteToken.trim(), remoteCode.trim());

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
      const message = error instanceof Error ? error.message : "Unable to accept invite";
      Alert.alert("Pairing failed", message);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Device identity</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={deviceName}
          onChangeText={setDeviceName}
          style={styles.input}
          placeholder="Device name"
          placeholderTextColor="#7e86a8"
          editable={!isBusy}
        />
        <Pressable style={styles.button} onPress={saveName} disabled={isBusy}>
          <Text style={styles.buttonText}>Save name</Text>
        </Pressable>
        <Text style={styles.meta}>Device ID: {deviceId || "-"}</Text>
        <Text style={styles.meta}>Fingerprint: {publicFingerprint || "-"}</Text>
      </View>

      <Text style={styles.sectionTitle}>Create invite</Text>
      <View style={styles.card}>
        <Pressable style={styles.button} onPress={generateInvite} disabled={isBusy}>
          <Text style={styles.buttonText}>Generate invite</Text>
        </Pressable>

        <Text style={styles.label}>Token</Text>
        <Text selectable style={styles.tokenText}>
          {invite?.token || "-"}
        </Text>
        <Pressable style={styles.outlineButton} onPress={copyInviteToken} disabled={!invite || isBusy}>
          <Text style={styles.outlineButtonText}>Copy token</Text>
        </Pressable>

        <Text style={styles.label}>Code phrase</Text>
        <Text selectable style={styles.codeText}>
          {invite?.codePhrase || "-"}
        </Text>
        <Pressable style={styles.outlineButton} onPress={copyInviteCode} disabled={!invite || isBusy}>
          <Text style={styles.outlineButtonText}>Copy code phrase</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Accept invite</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Remote token</Text>
        <TextInput
          value={remoteToken}
          onChangeText={setRemoteToken}
          style={[styles.input, styles.multilineInput]}
          multiline
          numberOfLines={5}
          placeholder="hexpair:..."
          placeholderTextColor="#7e86a8"
          editable={!isBusy}
        />

        <Text style={styles.label}>Code phrase</Text>
        <TextInput
          value={remoteCode}
          onChangeText={setRemoteCode}
          style={styles.input}
          placeholder="word word word word"
          placeholderTextColor="#7e86a8"
          editable={!isBusy}
        />

        <Pressable style={styles.button} onPress={acceptInvite} disabled={isBusy}>
          <Text style={styles.buttonText}>Accept invite</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Trusted peers</Text>
      <View style={styles.card}>
        {peers.length === 0 ? (
          <Text style={styles.meta}>No trusted peers yet</Text>
        ) : (
          peers.map((peer) => (
            <View key={peer.id} style={styles.peerRow}>
              <Text style={styles.peerName}>{peer.displayName}</Text>
              <Text style={styles.peerMeta}>{peer.id}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#090b14",
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  sectionTitle: {
    color: "#f2f5ff",
    fontSize: 18,
    fontWeight: "700",
  },
  card: {
    borderWidth: 1,
    borderColor: "#2b3154",
    borderRadius: 14,
    backgroundColor: "#101326",
    padding: 14,
    gap: 10,
  },
  label: {
    color: "#b8c0df",
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#2b3154",
    borderRadius: 10,
    backgroundColor: "#090b14",
    color: "#f2f5ff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  button: {
    borderRadius: 10,
    backgroundColor: "#57d3ff",
    paddingVertical: 11,
    alignItems: "center",
  },
  buttonText: {
    color: "#03111c",
    fontSize: 14,
    fontWeight: "700",
  },
  outlineButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2b3154",
    paddingVertical: 10,
    alignItems: "center",
  },
  outlineButtonText: {
    color: "#dbe3ff",
    fontSize: 14,
    fontWeight: "700",
  },
  tokenText: {
    color: "#cfd7f7",
    fontSize: 12,
    lineHeight: 18,
  },
  codeText: {
    color: "#f2f5ff",
    fontSize: 16,
    fontWeight: "700",
    textTransform: "lowercase",
  },
  meta: {
    color: "#9ca6cb",
    fontSize: 13,
  },
  peerRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#1f2443",
    paddingVertical: 8,
    gap: 4,
  },
  peerName: {
    color: "#f2f5ff",
    fontSize: 14,
    fontWeight: "600",
  },
  peerMeta: {
    color: "#9ca6cb",
    fontSize: 12,
  },
});
