import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { usePairingViewModel } from "@/features/security";
import { styles } from "./PairingScreen.styles";

export function PairingScreen() {
  const {
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
  } = usePairingViewModel();

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
        <Pressable
          style={styles.button}
          onPress={generateInvite}
          disabled={isBusy}
        >
          <Text style={styles.buttonText}>Generate invite</Text>
        </Pressable>

        <Text style={styles.label}>Token</Text>
        <Text selectable style={styles.tokenText}>
          {invite?.token || "-"}
        </Text>
        <Pressable
          style={styles.outlineButton}
          onPress={copyInviteToken}
          disabled={!invite || isBusy}
        >
          <Text style={styles.outlineButtonText}>Copy token</Text>
        </Pressable>

        <Text style={styles.label}>Code phrase</Text>
        <Text selectable style={styles.codeText}>
          {invite?.codePhrase || "-"}
        </Text>
        <Pressable
          style={styles.outlineButton}
          onPress={copyInviteCode}
          disabled={!invite || isBusy}
        >
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

        <Pressable
          style={styles.button}
          onPress={acceptInvite}
          disabled={isBusy}
        >
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
