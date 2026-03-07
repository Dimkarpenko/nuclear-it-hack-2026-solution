import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { StorageStats } from "@/entities/messenger";
import { getDiscoveryService } from "@/features/discovery";
import {
  getOrCreateDeviceIdentity,
  updateDeviceDisplayName,
} from "@/features/security";
import { getStorageStats } from "@/shared/lib/storage";

import { styles } from "./SettingsScreen.styles";

type SettingsScreenProps = {
  onBack?: () => void;
  onDisplayNameChanged?: (name: string) => void;
};

export function SettingsScreen({
  onBack,
  onDisplayNameChanged,
}: SettingsScreenProps) {
  const service = useMemo(() => getDiscoveryService(), []);
  const insets = useSafeAreaInsets();
  const [deviceId, setDeviceId] = useState("-");
  const [displayName, setDisplayName] = useState("-");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [fingerprint, setFingerprint] = useState("-");
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [transportState, setTransportState] = useState(service.getStatus());
  const [nearbyCount, setNearbyCount] = useState(service.getPeers().length);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState("");

  const refresh = async () => {
    const [identity, nextStats] = await Promise.all([
      getOrCreateDeviceIdentity(),
      getStorageStats(),
    ]);

    service.start(identity);
    setDeviceId(identity.deviceId);
    setDisplayName(identity.displayName);
    setDisplayNameDraft(identity.displayName);
    setFingerprint(identity.publicKey.slice(0, 20).toUpperCase());
    setStats(nextStats);
    setTransportState(service.getStatus());
    setNearbyCount(service.getPeers().length);
  };

  const saveDisplayName = async () => {
    const safe = displayNameDraft.trim();
    if (!safe) {
      setNameError("Имя не может быть пустым");
      return;
    }

    setIsSavingName(true);
    try {
      const updated = await updateDeviceDisplayName(safe);
      service.start(updated);
      setDisplayName(updated.displayName);
      setDisplayNameDraft(updated.displayName);
      setNameError("");
      onDisplayNameChanged?.(updated.displayName);
    } finally {
      setIsSavingName(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => undefined);

    const unsubscribeStatus = service.subscribeStatus((next) => {
      setTransportState(next);
    });

    const unsubscribePeers = service.subscribePeers((peers) => {
      setNearbyCount(peers.length);
    });

    return () => {
      unsubscribeStatus();
      unsubscribePeers();
    };
  }, [service]);

  const expoVersion =
    (Constants.expoConfig?.version as string | undefined) ?? "-";
  const sdkVersion =
    (Constants.expoConfig?.sdkVersion as string | undefined) ?? "55";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: 16 + insets.top,
          paddingBottom: 112 + insets.bottom,
        },
      ]}
    >
      <View style={styles.headerWrap}>
        {onBack ? (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>{"<"}</Text>
          </Pressable>
        ) : null}

        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Настройки</Text>
          <Text style={styles.subtitle}>
            Техническое состояние и диагностика.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Профиль</Text>
        <TextInput
          value={displayNameDraft}
          onChangeText={(value) => {
            setDisplayNameDraft(value);
            if (nameError) {
              setNameError("");
            }
          }}
          style={styles.profileInput}
          placeholder="Твое имя"
          placeholderTextColor="#8d9ac7"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={40}
          editable={!isSavingName}
        />
        {nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
        <Pressable
          style={[
            styles.secondaryButton,
            isSavingName ? styles.secondaryButtonDisabled : null,
          ]}
          onPress={() => saveDisplayName().catch(() => undefined)}
          disabled={isSavingName}
        >
          <Text style={styles.secondaryButtonText}>
            {isSavingName ? "Сохранение..." : "Сохранить имя"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Устройство</Text>
        <Text style={styles.metric}>Имя: {displayName}</Text>
        <Text style={styles.metric}>ID: {deviceId}</Text>
        <Text style={styles.metric}>Отпечаток: {fingerprint}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Транспорт</Text>
        <Text style={styles.metric}>
          Состояние: {transportState.connectionState}
        </Text>
        <Text style={styles.metric}>Тип: {transportState.transport}</Text>
        <Text style={styles.metric}>Область: {transportState.scope}</Text>
        <Text style={styles.metric}>
          Relay: {transportState.relayUrl ?? "-"}
        </Text>
        <Text style={styles.metric}>Пиров рядом: {nearbyCount}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Хранилище</Text>
        <Text style={styles.metric}>Peers: {stats?.peers ?? 0}</Text>
        <Text style={styles.metric}>Chats: {stats?.chats ?? 0}</Text>
        <Text style={styles.metric}>Messages: {stats?.messages ?? 0}</Text>
        <Text style={styles.metric}>Transfers: {stats?.transfers ?? 0}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Runtime</Text>
        <Text style={styles.metric}>Версия приложения: {expoVersion}</Text>
        <Text style={styles.metric}>Expo SDK: {sdkVersion}</Text>
      </View>

      <Pressable
        style={styles.button}
        onPress={() => refresh().catch(() => undefined)}
      >
        <Text style={styles.buttonText}>Обновить техинфо</Text>
      </Pressable>
    </ScrollView>
  );
}
