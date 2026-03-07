import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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

type PendingPeer = {
  peerId: string;
  networkName: string;
};

function formatAge(lastSeenAt: number): string {
  const delta = Math.max(0, Math.floor((Date.now() - lastSeenAt) / 1000));
  return `${delta} c назад`;
}

export function DiscoveryScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { peers, refreshNow, sendPairingIntent } = useDiscoveryViewModel();
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [pendingPeer, setPendingPeer] = useState<PendingPeer | null>(null);
  const [nameDraft, setNameDraft] = useState("");
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

  const openStartChatDialog = (peerId: string, peerName: string) => {
    setPendingPeer({
      peerId,
      networkName: peerName,
    });
    setNameDraft(peerName);
  };

  const closeStartChatDialog = () => {
    setPendingPeer(null);
    setNameDraft("");
  };

  const confirmStartChat = () => {
    if (!pendingPeer) {
      return;
    }

    const chatName = nameDraft.trim() || pendingPeer.networkName;
    sendPairingIntent(pendingPeer.peerId, chatName);
    navigation.navigate("Main", {
      openPeerId: pendingPeer.peerId,
      openPeerName: chatName,
      openAt: Date.now(),
    });
    closeStartChatDialog();
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View>
          <Text style={styles.title}>Поиск устройств</Text>
          <Text style={styles.subtitle}>
            Нажми кнопку, чтобы найти доступные устройства в локальной сети.
          </Text>
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
              Проверь, что второй телефон в той же локальной сети, и попробуй
              еще раз.
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
                  onPress={() =>
                    openStartChatDialog(peer.peerId, peer.displayName)
                  }
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

      <Modal
        transparent
        visible={pendingPeer !== null}
        animationType="fade"
        onRequestClose={closeStartChatDialog}
      >
        <View style={styles.nameModalBackdrop}>
          <View style={styles.nameModalCard}>
            <Text style={styles.nameModalTitle}>Имя собеседника</Text>
            <Text style={styles.nameModalSubtitle}>Как назвать этот чат?</Text>

            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              style={styles.nameModalInput}
              placeholder="Например: Алекс"
              placeholderTextColor="#7e9bb7"
              autoCapitalize="words"
              autoCorrect={false}
            />

            <View style={styles.nameModalActions}>
              <Pressable
                style={styles.nameModalCancelButton}
                onPress={closeStartChatDialog}
              >
                <Text style={styles.nameModalCancelText}>Отмена</Text>
              </Pressable>

              <Pressable
                style={styles.nameModalConfirmButton}
                onPress={confirmStartChat}
              >
                <Text style={styles.nameModalConfirmText}>Продолжить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
