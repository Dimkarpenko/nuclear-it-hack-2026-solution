import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { RootStackParamList } from "@/core/navigation/RootNavigator";
import { useDiscoveryViewModel } from "@/features/discovery/model/useDiscoveryViewModel";
import { styles } from "./DiscoveryScreen.styles";

const SEARCH_WINDOW_MS = 3200;

function formatAge(lastSeenAt: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - lastSeenAt) / 1000));
  return `${delta} c назад`;
}

export function DiscoveryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    peers,
    status,
    relayUrlInput,
    setRelayUrlInput,
    isAutoDetectingRelay,
    refreshNow,
    applyRelayUrl,
    autoDetectRelay,
    useBrowserLocalTransport,
    sendPairingIntent,
  } = useDiscoveryViewModel();
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginSearch = async () => {
    if (isSearching) {
      return;
    }

    setHasSearched(false);
    setIsSearching(true);

    await refreshNow();

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setIsSearching(false);
      setHasSearched(true);
      timerRef.current = null;
    }, SEARCH_WINDOW_MS);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const startChatWithPeer = (peerId: string, peerName: string) => {
    sendPairingIntent(peerId).catch(() => undefined);
    navigation.navigate("Main", {
      openPeerId: peerId,
      openPeerName: peerName,
      openAt: Date.now(),
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.title}>Поиск устройств</Text>
        <Text style={styles.subtitle}>
          Нажми кнопку, чтобы найти доступные устройства в локальной сети.
        </Text>
      </View>

      <View style={styles.relayCard}>
        <Text style={styles.relayTitle}>LAN Relay</Text>
        <Text style={styles.relayMeta}>
          Состояние: {status.connectionState}
        </Text>
        <Text style={styles.relayMeta}>
          Текущий URL: {status.relayUrl ?? "-"}
        </Text>

        <TextInput
          style={styles.relayInput}
          value={relayUrlInput}
          onChangeText={setRelayUrlInput}
          placeholder="ws://192.168.1.10:8787 или 192.168.1.10"
          placeholderTextColor="#86a8c7"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.relayActions}>
          <Pressable
            style={styles.relayButton}
            onPress={() => applyRelayUrl().catch(() => undefined)}
          >
            <Text style={styles.relayButtonText}>Подключить</Text>
          </Pressable>
          <Pressable
            style={styles.relayButton}
            onPress={() => autoDetectRelay().catch(() => undefined)}
            disabled={isAutoDetectingRelay}
          >
            <Text style={styles.relayButtonText}>
              {isAutoDetectingRelay ? "Поиск..." : "Автоопределение"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.relayFallbackButton}
          onPress={() => useBrowserLocalTransport().catch(() => undefined)}
        >
          <Text style={styles.relayFallbackText}>Отключить relay</Text>
        </Pressable>
      </View>

      <View style={styles.searchCard}>
        <Pressable
          style={styles.searchButton}
          onPress={() => beginSearch().catch(() => undefined)}
          disabled={isSearching}
        >
          <Text style={styles.searchButtonText}>
            {isSearching ? "Ищем устройства..." : "Найти устройства"}
          </Text>
        </Pressable>
      </View>

      {isSearching ? (
        <View style={styles.stateCard}>
          <ActivityIndicator size="large" color="#65c0ff" />
          <Text style={styles.stateTitle}>Идет поиск устройств</Text>
          <Text style={styles.stateSubtitle}>
            Пожалуйста, подожди несколько секунд
          </Text>
        </View>
      ) : hasSearched && peers.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Устройств в сети не найдено</Text>
          <Text style={styles.stateSubtitle}>
            Проверь, что второй телефон в той же локальной сети, и попробуй еще
            раз.
          </Text>
        </View>
      ) : peers.length > 0 ? (
        <View style={styles.peersBlock}>
          <Text style={styles.blockTitle}>
            Найденные устройства ({peers.length})
          </Text>
          {peers.map((peer) => (
            <View key={peer.peerId} style={styles.peerRow}>
              <Text style={styles.peerName}>{peer.displayName}</Text>
              <Text style={styles.peerMeta}>
                ID: {peer.peerId.slice(0, 20)}
              </Text>
              <Text style={styles.peerMeta}>
                В сети: {formatAge(peer.lastSeenAt)}
              </Text>
              <Pressable
                style={styles.startChatButton}
                onPress={() => startChatWithPeer(peer.peerId, peer.displayName)}
              >
                <Text style={styles.startChatButtonText}>Начать чат</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Нажми «Найти устройства»</Text>
          <Text style={styles.stateSubtitle}>
            После поиска здесь появится список доступных устройств.
          </Text>
        </View>
      )}

      {hasSearched && peers.length > 0 ? (
        <View style={styles.tipBlock}>
          <Text style={styles.tipText}>
            Устройства найдены. Если список изменился, потяни экран вниз или
            запусти поиск снова.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
