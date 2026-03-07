import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as FileSystem from "expo-file-system/legacy";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RootStackParamList } from "@/core/navigation/RootNavigator";
import { styles } from "./ChatScreen.styles";
import { useChatViewModel } from "./useChatViewModel";

const FAVORITES_CHAT_ID = "favorites-chat";

type ExpoAudioModule = typeof import("expo-audio");
type WebRtcModule = typeof import("react-native-webrtc");
type WebRtcSessionDescription = { sdp?: string; type?: string };
type WebRtcIceCandidate = Record<string, unknown>;
type WebRtcPeerConnection = import("react-native-webrtc").RTCPeerConnection;
type WebRtcMediaStream = import("react-native-webrtc").MediaStream;

const expoAudioModule: ExpoAudioModule | null = (() => {
  try {
    return require("expo-audio") as ExpoAudioModule;
  } catch {
    return null;
  }
})();

const webRtcModule: WebRtcModule | null = (() => {
  try {
    return require("react-native-webrtc") as WebRtcModule;
  } catch {
    return null;
  }
})();

const fallbackRecorderState = {
  canRecord: false,
  isRecording: false,
  durationMillis: 0,
  mediaServicesDidReset: false,
  url: null,
};

function formatDuration(totalMs: number): string {
  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const mm = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatDeliveryStatus(status: string): string {
  if (status === "delivered") {
    return "доставлено";
  }
  if (status === "sent") {
    return "отправлено";
  }
  if (status === "failed") {
    return "ошибка";
  }
  if (status === "pending") {
    return "ожидание";
  }
  return status;
}

function formatMessageMeta(createdAt: number, status: string): string {
  const hhmm = new Date(createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${hhmm} · ${formatDeliveryStatus(status)}`;
}

function formatChatTime(value: number | null): string {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildChatSubtitle(chatId: string, isOnline: boolean): string {
  if (chatId === FAVORITES_CHAT_ID) {
    return "Сохраненные сообщения";
  }

  return isOnline ? "онлайн" : "офлайн";
}

type ChatScreenProps = {
  onOpenMenu?: () => void;
  openChatRequest?: {
    peerId: string;
    peerName?: string;
    token: number;
  } | null;
  onOpenChatHandled?: () => void;
};

export function ChatScreen({
  onOpenMenu,
  openChatRequest,
  onOpenChatHandled,
}: ChatScreenProps) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  const {
    isReady,
    localPeerId,
    chats,
    onlinePeerIds,
    selectedChatId,
    messages,
    transfers,
    draft,
    setDraft,
    selectChat,
    closeChat,
    startChatWithPeer,
    refresh,
    sendMessage,
    sendFile,
    sendVoiceMessage,
    sendVoiceInvite,
    incomingCallEvent,
    clearIncomingCallEvent,
    getVoiceMessageUri,
  } = useChatViewModel();

  const [isFabMenuOpen, setIsFabMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string>("");
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(false);
  const [incomingCallRequest, setIncomingCallRequest] = useState<{
    chatId: string;
    peerId: string;
    videoEnabled: boolean;
  } | null>(null);
  const handledOpenTokenRef = useRef<number | null>(null);
  const messageListRef = useRef<ScrollView | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const peerConnectionRef = useRef<WebRtcPeerConnection | null>(null);
  const localStreamRef = useRef<WebRtcMediaStream | null>(null);
  const pendingRemoteOfferRef = useRef<string | null>(null);
  const pendingIceCandidatesRef = useRef<string[]>([]);
  const playbackRef = useRef<ReturnType<
    ExpoAudioModule["createAudioPlayer"]
  > | null>(null);
  const playbackSubscriptionRef = useRef<{ remove: () => void } | null>(null);
  const voiceRecordingOptions = useMemo(() => {
    if (!expoAudioModule) {
      return null;
    }

    const preset = expoAudioModule.RecordingPresets.HIGH_QUALITY;

    return {
      ...preset,
      sampleRate: 24000,
      numberOfChannels: 1,
      bitRate: 48000,
    };
  }, []);
  const recorder = expoAudioModule
    ? expoAudioModule.useAudioRecorder(
        voiceRecordingOptions ?? expoAudioModule.RecordingPresets.HIGH_QUALITY,
        (status) => {
          if (status.url) {
            recordingUrlRef.current = status.url;
          }
        },
      )
    : null;
  const recorderState =
    expoAudioModule && recorder
      ? expoAudioModule.useAudioRecorderState(recorder, 250)
      : fallbackRecorderState;

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const onlinePeerIdSet = useMemo(
    () => new Set(onlinePeerIds),
    [onlinePeerIds],
  );
  const transferByMessageId = useMemo(() => {
    return new Map(transfers.map((transfer) => [transfer.messageId, transfer]));
  }, [transfers]);

  const canSend = draft.trim().length > 0 && activeChat !== null;
  const canCall = activeChat !== null && activeChat.id !== FAVORITES_CHAT_ID;
  const isRecordingVoice = recorderState.isRecording;
  const recordingDurationMs = recorderState.durationMillis;
  const callDurationLabel = formatDuration(callDurationSec * 1000);

  const setVoiceUnavailable = () => {
    setVoiceError(
      "Голосовые недоступны в этой сборке. Обнови приложение на устройстве.",
    );
  };

  const stopPlayback = async () => {
    const playback = playbackRef.current;
    if (!playback) {
      return;
    }

    playbackSubscriptionRef.current?.remove();
    playbackSubscriptionRef.current = null;
    playbackRef.current = null;
    playback.pause();
    playback.remove();
    setPlayingMessageId(null);
  };

  const closeWebRtcConnection = () => {
    const connection = peerConnectionRef.current;
    if (connection) {
      const unsafeConnection = connection as unknown as {
        onicecandidate?:
          | ((event: { candidate?: unknown | null }) => void)
          | null;
        ontrack?: (() => void) | null;
        onconnectionstatechange?: (() => void) | null;
      };
      unsafeConnection.onicecandidate = null;
      unsafeConnection.ontrack = null;
      unsafeConnection.onconnectionstatechange = null;
      connection.close();
      peerConnectionRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingRemoteOfferRef.current = null;
    pendingIceCandidatesRef.current = [];
  };

  const flushPendingRemoteIceCandidates = async (
    connection: WebRtcPeerConnection,
  ) => {
    if (!webRtcModule || !connection.remoteDescription) {
      return;
    }

    const { RTCIceCandidate } = webRtcModule;
    const queue = pendingIceCandidatesRef.current.splice(0);

    for (const raw of queue) {
      try {
        const parsed = JSON.parse(raw) as WebRtcIceCandidate;
        await connection.addIceCandidate(new RTCIceCandidate(parsed));
      } catch {
        continue;
      }
    }
  };

  const addRemoteIceCandidate = async (candidateRaw: string) => {
    if (!webRtcModule || !candidateRaw) {
      return;
    }

    const connection = peerConnectionRef.current;
    if (!connection || !connection.remoteDescription) {
      pendingIceCandidatesRef.current.push(candidateRaw);
      return;
    }

    const { RTCIceCandidate } = webRtcModule;

    try {
      const parsed = JSON.parse(candidateRaw) as WebRtcIceCandidate;
      await connection.addIceCandidate(new RTCIceCandidate(parsed));
    } catch {
      pendingIceCandidatesRef.current.push(candidateRaw);
    }
  };

  const ensureWebRtcPeerConnection = async () => {
    if (!webRtcModule) {
      setVoiceError("WebRTC недоступен в этой сборке приложения.");
      return null;
    }

    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }

    const { RTCPeerConnection, mediaDevices } = webRtcModule;
    const connection = new RTCPeerConnection({
      iceServers: [],
      iceCandidatePoolSize: 2,
    });
    const unsafeConnection = connection as unknown as {
      onicecandidate?: ((event: { candidate?: unknown | null }) => void) | null;
      onconnectionstatechange?: (() => void) | null;
    };

    const handleIceCandidate = (event: { candidate?: unknown | null }) => {
      const candidate = event.candidate as
        | { toJSON?: () => unknown }
        | undefined
        | null;

      if (!candidate) {
        return;
      }

      const candidatePayload = JSON.stringify(
        typeof candidate.toJSON === "function" ? candidate.toJSON() : candidate,
      );

      sendVoiceInvite({
        type: "webrtc-ice",
        candidate: candidatePayload,
        silent: true,
      }).catch(() => undefined);
    };
    unsafeConnection.onicecandidate = handleIceCandidate;

    const handleConnectionState = () => {
      if (connection.connectionState === "failed") {
        setVoiceError("WebRTC соединение оборвалось.");
      }
    };
    unsafeConnection.onconnectionstatechange = handleConnectionState;

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isMicMuted;
    });
    stream.getTracks().forEach((track) => {
      connection.addTrack(track, stream);
    });

    localStreamRef.current = stream;
    peerConnectionRef.current = connection;
    return connection;
  };

  const startWebRtcAsCaller = async () => {
    const connection = await ensureWebRtcPeerConnection();
    if (!connection) {
      throw new Error("webrtc-unavailable");
    }

    const offer = await connection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await connection.setLocalDescription(offer);
    await sendVoiceInvite({
      type: "webrtc-offer",
      sdp: JSON.stringify(offer),
      silent: true,
    });
  };

  const answerWebRtcOffer = async (offerRaw: string) => {
    if (!webRtcModule) {
      return;
    }

    const connection = await ensureWebRtcPeerConnection();
    if (!connection) {
      return;
    }

    const { RTCSessionDescription } = webRtcModule;
    const offer = JSON.parse(offerRaw) as WebRtcSessionDescription;
    if (!offer.sdp || !offer.type) {
      return;
    }
    await connection.setRemoteDescription(
      new RTCSessionDescription({
        sdp: offer.sdp,
        type: offer.type,
      }),
    );
    await flushPendingRemoteIceCandidates(connection);

    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    await sendVoiceInvite({
      type: "webrtc-answer",
      sdp: JSON.stringify(answer),
      silent: true,
    });
  };

  const applyWebRtcAnswer = async (answerRaw: string) => {
    if (!webRtcModule || !answerRaw) {
      return;
    }

    const connection = peerConnectionRef.current;
    if (!connection) {
      return;
    }

    const { RTCSessionDescription } = webRtcModule;
    const answer = JSON.parse(answerRaw) as WebRtcSessionDescription;
    if (!answer.sdp || !answer.type) {
      return;
    }
    await connection.setRemoteDescription(
      new RTCSessionDescription({
        sdp: answer.sdp,
        type: answer.type,
      }),
    );
    await flushPendingRemoteIceCandidates(connection);
  };

  const startCall = async () => {
    if (!activeChat || activeChat.id === FAVORITES_CHAT_ID) {
      return;
    }

    if (!webRtcModule) {
      setVoiceError("WebRTC недоступен в этой сборке приложения.");
      return;
    }

    setVoiceError("");
    try {
      setIsCallActive(true);
      setCallStartedAt(Date.now());
      setCallDurationSec(0);
      setIsMicMuted(false);
      setIsSpeakerOn(false);
      setIsVideoEnabled(false);
      setIsRemoteVideoEnabled(false);
      setIncomingCallRequest(null);

      await sendVoiceInvite({ type: "call-start", videoEnabled: false });
      await startWebRtcAsCaller();
    } catch {
      closeWebRtcConnection();
      setIsCallActive(false);
      setCallStartedAt(null);
      setCallDurationSec(0);
      setVoiceError("Не удалось запустить P2P звонок.");
    }
  };

  const endCall = async () => {
    if (isCallActive) {
      await sendVoiceInvite({ type: "call-end" }).catch(() => undefined);
    }

    closeWebRtcConnection();
    setIsCallActive(false);
    setCallStartedAt(null);
    setCallDurationSec(0);
    setIsMicMuted(false);
    setIsSpeakerOn(false);
    setIsVideoEnabled(false);
    setIsRemoteVideoEnabled(false);
    setIncomingCallRequest(null);
  };

  const acceptIncomingCall = async () => {
    if (!incomingCallRequest) {
      return;
    }

    if (!webRtcModule) {
      setVoiceError("WebRTC недоступен в этой сборке приложения.");
      return;
    }

    setVoiceError("");
    setIncomingCallRequest(null);
    setIsCallActive(true);
    setCallStartedAt(Date.now());
    setCallDurationSec(0);
    setIsMicMuted(false);
    setIsSpeakerOn(false);
    setIsVideoEnabled(false);
    setIsRemoteVideoEnabled(incomingCallRequest.videoEnabled);

    const pendingOffer = pendingRemoteOfferRef.current;
    pendingRemoteOfferRef.current = null;

    await sendVoiceInvite({ type: "call-accept", videoEnabled: false }).catch(
      () => undefined,
    );

    if (pendingOffer) {
      await answerWebRtcOffer(pendingOffer).catch(() => undefined);
    }
  };

  const declineIncomingCall = async () => {
    if (!incomingCallRequest) {
      return;
    }

    setIncomingCallRequest(null);
    closeWebRtcConnection();
    await sendVoiceInvite({ type: "call-end" }).catch(() => undefined);
  };

  const toggleVideo = async () => {
    const next = !isVideoEnabled;
    setIsVideoEnabled(next);

    if (isCallActive) {
      await sendVoiceInvite({ type: "video-toggle", videoEnabled: next });
    }
  };

  const startVoiceRecording = async () => {
    if (!activeChat || isRecordingVoice) {
      return;
    }

    if (!expoAudioModule || !recorder) {
      setVoiceUnavailable();
      return;
    }

    setVoiceError("");
    recordingUrlRef.current = null;

    const permission = await expoAudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setVoiceError("Нет доступа к микрофону.");
      return;
    }

    try {
      await expoAudioModule.setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      setVoiceError("Не удалось начать запись.");
    }
  };

  const stopVoiceRecording = async () => {
    if (!isRecordingVoice) {
      return;
    }

    if (!expoAudioModule || !recorder) {
      setVoiceUnavailable();
      return;
    }

    try {
      const durationSnapshot = recorderState.durationMillis;
      await recorder.stop();
      const uri = recordingUrlRef.current ?? recorderState.url;
      const durationMs = Math.max(
        durationSnapshot,
        recorderState.durationMillis,
      );

      if (uri) {
        await sendVoiceMessage(uri, durationMs);
      } else {
        setVoiceError("Не удалось получить файл записи.");
      }
    } catch {
      setVoiceError("Ошибка отправки голосового сообщения.");
    } finally {
      await expoAudioModule
        .setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
        })
        .catch(() => undefined);
    }
  };

  const toggleVoiceRecording = async () => {
    if (isRecordingVoice) {
      await stopVoiceRecording();
      return;
    }

    await startVoiceRecording();
  };

  const toggleVoicePlayback = async (messageId: string, transferId: string) => {
    if (!expoAudioModule) {
      setVoiceUnavailable();
      return;
    }

    if (playingMessageId === messageId) {
      await stopPlayback();
      return;
    }

    await stopPlayback();

    const uri = getVoiceMessageUri(transferId);
    if (!uri) {
      return;
    }

    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (!info || !info.exists) {
      return;
    }

    setVoiceError("");

    const player = expoAudioModule.createAudioPlayer(uri, {
      updateInterval: 250,
    });

    playbackSubscriptionRef.current = player.addListener(
      "playbackStatusUpdate",
      (status) => {
        if (status.didJustFinish || !status.isLoaded) {
          playbackSubscriptionRef.current?.remove();
          playbackSubscriptionRef.current = null;
          playbackRef.current?.remove();
          playbackRef.current = null;
          setPlayingMessageId((current) =>
            current === messageId ? null : current,
          );
        }
      },
    );

    playbackRef.current = player;
    player.play();
    setPlayingMessageId(messageId);
  };

  const handlePullToRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const scrollToBottom = (animated: boolean) => {
    messageListRef.current?.scrollToEnd({ animated });
  };

  useEffect(() => {
    if (!openChatRequest) {
      return;
    }

    if (handledOpenTokenRef.current === openChatRequest.token) {
      return;
    }

    let cancelled = false;

    startChatWithPeer(openChatRequest.peerId, openChatRequest.peerName)
      .then((opened) => {
        if (!opened || cancelled) {
          return;
        }

        handledOpenTokenRef.current = openChatRequest.token;
        onOpenChatHandled?.();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [localPeerId, openChatRequest, onOpenChatHandled, startChatWithPeer]);

  useEffect(() => {
    if (!activeChat) {
      return;
    }

    const timer = setTimeout(() => {
      scrollToBottom(false);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [activeChat?.id]);

  useEffect(() => {
    if (!activeChat || messages.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      scrollToBottom(true);
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [activeChat?.id, messages.length]);

  useEffect(() => {
    if (!isCallActive || !callStartedAt) {
      return;
    }

    const id = setInterval(() => {
      setCallDurationSec(
        Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000)),
      );
    }, 1000);

    return () => {
      clearInterval(id);
    };
  }, [isCallActive, callStartedAt]);

  useEffect(() => {
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !isMicMuted;
    });
  }, [isMicMuted]);

  useEffect(() => {
    if (!incomingCallEvent) {
      return;
    }

    if (!activeChat || incomingCallEvent.chatId !== activeChat.id) {
      clearIncomingCallEvent();
      return;
    }

    if (incomingCallEvent.type === "call-start") {
      if (!isCallActive) {
        setIncomingCallRequest({
          chatId: incomingCallEvent.chatId,
          peerId: incomingCallEvent.peerId,
          videoEnabled: Boolean(incomingCallEvent.videoEnabled),
        });
      }
    }

    if (incomingCallEvent.type === "call-accept") {
      setIncomingCallRequest(null);
      setIsCallActive(true);
      if (!callStartedAt) {
        setCallStartedAt(Date.now());
        setCallDurationSec(0);
      }
    }

    if (incomingCallEvent.type === "call-end") {
      setIncomingCallRequest(null);
      closeWebRtcConnection();
      setIsCallActive(false);
      setCallStartedAt(null);
      setCallDurationSec(0);
      setIsMicMuted(false);
      setIsSpeakerOn(false);
      setIsVideoEnabled(false);
      setIsRemoteVideoEnabled(false);
    }

    if (incomingCallEvent.type === "video-toggle") {
      setIsRemoteVideoEnabled(Boolean(incomingCallEvent.videoEnabled));
    }

    if (incomingCallEvent.type === "webrtc-offer") {
      if (incomingCallEvent.sdp) {
        pendingRemoteOfferRef.current = incomingCallEvent.sdp;
        if (isCallActive) {
          answerWebRtcOffer(incomingCallEvent.sdp).catch(() => undefined);
        }
      }
    }

    if (incomingCallEvent.type === "webrtc-answer") {
      if (incomingCallEvent.sdp) {
        applyWebRtcAnswer(incomingCallEvent.sdp).catch(() => undefined);
      }
    }

    if (incomingCallEvent.type === "webrtc-ice") {
      if (incomingCallEvent.candidate) {
        addRemoteIceCandidate(incomingCallEvent.candidate).catch(
          () => undefined,
        );
      }
    }

    clearIncomingCallEvent();
  }, [
    activeChat,
    callStartedAt,
    clearIncomingCallEvent,
    incomingCallEvent,
    isCallActive,
  ]);

  useEffect(() => {
    return () => {
      if (recorder) {
        recorder.stop().catch(() => undefined);
      }

      if (expoAudioModule) {
        expoAudioModule
          .setAudioModeAsync({
            allowsRecording: false,
            playsInSilentMode: true,
          })
          .catch(() => undefined);
      }

      playbackSubscriptionRef.current?.remove();
      playbackSubscriptionRef.current = null;
      playbackRef.current?.remove();
      playbackRef.current = null;
      closeWebRtcConnection();
    };
  }, [recorder]);

  if (activeChat) {
    return (
      <View style={styles.container}>
        <View
          style={[
            styles.roomHeader,
            {
              paddingTop: insets.top + 6,
              minHeight: 74 + insets.top,
            },
          ]}
        >
          <Pressable style={styles.headerBack} onPress={closeChat}>
            <Text style={styles.headerBackText}>{"<"}</Text>
          </Pressable>

          <View style={styles.chatAvatarBig}>
            <Text style={styles.chatAvatarTextBig}>
              {activeChat.id === FAVORITES_CHAT_ID
                ? "S"
                : activeChat.resolvedTitle.slice(0, 1).toUpperCase()}
            </Text>
          </View>

          <View style={styles.roomHeaderTextWrap}>
            <Text style={styles.roomHeaderTitle}>
              {activeChat.resolvedTitle}
            </Text>
            <Text style={styles.roomHeaderMeta}>
              {buildChatSubtitle(
                activeChat.id,
                onlinePeerIdSet.has(activeChat.participantPeerId),
              )}
            </Text>
          </View>

          <Pressable
            style={[
              styles.headerCallButton,
              isCallActive ? styles.headerCallButtonActive : null,
              canCall ? null : styles.headerCallButtonDisabled,
            ]}
            onPress={() =>
              (isCallActive ? endCall() : startCall()).catch(() => undefined)
            }
            disabled={!canCall}
          >
            <Ionicons
              name={isCallActive ? "call" : "call-outline"}
              size={17}
              color={isCallActive ? "#ffe9ec" : "#d9ebfc"}
            />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardArea}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={styles.roomBody}>
            {!isReady ? (
              <View style={styles.centerWrap}>
                <Text style={styles.emptyText}>Загрузка...</Text>
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.centerWrap}>
                <Text style={styles.emptyText}>Сообщений пока нет</Text>
              </View>
            ) : (
              <ScrollView
                ref={messageListRef}
                style={styles.messageList}
                contentContainerStyle={styles.messageListContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                onContentSizeChange={() => scrollToBottom(false)}
              >
                {messages.map((message) => {
                  const isOutgoing = message.senderPeerId === localPeerId;
                  const transfer = transferByMessageId.get(message.id);
                  const isVoiceMessage = Boolean(
                    transfer &&
                    transfer.mimeType.toLowerCase().startsWith("audio/"),
                  );
                  const isVoiceReady = Boolean(
                    transfer && transfer.status === "completed",
                  );
                  const transferProgress =
                    transfer && transfer.totalBytes > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (transfer.transferredBytes / transfer.totalBytes) *
                              100,
                          ),
                        )
                      : 0;

                  return (
                    <View
                      key={message.id}
                      style={isOutgoing ? styles.bubbleOut : styles.bubbleIn}
                    >
                      {isVoiceMessage && transfer ? (
                        <Pressable
                          style={
                            isOutgoing
                              ? styles.voiceActionOut
                              : styles.voiceActionIn
                          }
                          onPress={() =>
                            toggleVoicePlayback(message.id, transfer.id).catch(
                              () => undefined,
                            )
                          }
                          disabled={!isVoiceReady}
                        >
                          <Ionicons
                            name={
                              playingMessageId === message.id ? "pause" : "play"
                            }
                            size={16}
                            color={isOutgoing ? "#062236" : "#d9ecff"}
                          />
                          <Text
                            style={
                              isOutgoing
                                ? styles.voiceActionTextOut
                                : styles.voiceActionTextIn
                            }
                          >
                            {isVoiceReady
                              ? playingMessageId === message.id
                                ? "Пауза"
                                : "Прослушать"
                              : `Голосовое ${transferProgress}%`}
                          </Text>
                        </Pressable>
                      ) : (
                        <Text
                          style={
                            isOutgoing
                              ? styles.bubbleTextOut
                              : styles.bubbleTextIn
                          }
                        >
                          {message.body}
                        </Text>
                      )}
                      <Text
                        style={
                          isOutgoing
                            ? styles.bubbleMetaOut
                            : styles.bubbleMetaIn
                        }
                      >
                        {formatMessageMeta(message.createdAt, message.status)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View
            style={[
              styles.composerWrap,
              {
                paddingBottom: 10 + insets.bottom,
              },
            ]}
          >
            <View style={styles.composerRow}>
              <Pressable
                style={styles.sideActionButton}
                onPress={() => sendFile().catch(() => undefined)}
              >
                <Text style={styles.sideActionButtonText}>+</Text>
              </Pressable>

              <TextInput
                value={draft}
                onChangeText={setDraft}
                style={styles.input}
                placeholder="Написать сообщение"
                placeholderTextColor="#7e86a8"
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={() => sendMessage().catch(() => undefined)}
              />

              <Pressable
                style={[
                  styles.voiceButton,
                  isRecordingVoice ? styles.voiceButtonActive : null,
                ]}
                onPress={() => toggleVoiceRecording().catch(() => undefined)}
              >
                <Ionicons
                  name={isRecordingVoice ? "stop-circle" : "mic"}
                  size={18}
                  color={isRecordingVoice ? "#ffffff" : "#d7ecff"}
                />
              </Pressable>

              <Pressable
                style={[
                  styles.sendButton,
                  canSend ? null : styles.disabledSendButton,
                ]}
                onPress={() => sendMessage().catch(() => undefined)}
                disabled={!canSend}
              >
                <Ionicons name="paper-plane" size={16} color="#041627" />
              </Pressable>
            </View>

            {voiceError ? (
              <Text style={styles.voiceError}>{voiceError}</Text>
            ) : null}
          </View>
        </KeyboardAvoidingView>

        <Modal
          transparent
          visible={incomingCallRequest !== null}
          animationType="fade"
          onRequestClose={() => declineIncomingCall().catch(() => undefined)}
        >
          <View style={styles.callBackdrop}>
            <View style={styles.callIncomingCard}>
              <View style={styles.callIncomingIconWrap}>
                <Ionicons name="call" size={22} color="#e8f5ff" />
              </View>
              <Text style={styles.callIncomingTitle}>Входящий звонок</Text>
              <Text style={styles.callIncomingSubtitle}>
                {activeChat.resolvedTitle}
              </Text>

              <View style={styles.callIncomingActions}>
                <Pressable
                  style={styles.callDeclineButton}
                  onPress={() => declineIncomingCall().catch(() => undefined)}
                >
                  <Ionicons name="close" size={18} color="#ffeef1" />
                  <Text style={styles.callDeclineText}>Отклонить</Text>
                </Pressable>

                <Pressable
                  style={styles.callAcceptButton}
                  onPress={() => acceptIncomingCall().catch(() => undefined)}
                >
                  <Ionicons name="call" size={18} color="#eaf7ff" />
                  <Text style={styles.callAcceptText}>Принять</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          transparent
          visible={isCallActive}
          animationType="fade"
          onRequestClose={() => endCall().catch(() => undefined)}
        >
          <View style={styles.callBackdrop}>
            <View style={styles.callCard}>
              <Text style={styles.callTitle}>
                Звонок: {activeChat.resolvedTitle}
              </Text>
              <Text style={styles.callTimer}>{callDurationLabel}</Text>

              <View style={styles.callVideoArea}>
                <Ionicons
                  name={isVideoEnabled ? "videocam" : "videocam-off"}
                  size={22}
                  color="#d8ecff"
                />
                <Text style={styles.callVideoText}>
                  {isVideoEnabled ? "Камера включена" : "Камера выключена"}
                </Text>
              </View>

              <Text style={styles.callRemoteVideoText}>
                {isRemoteVideoEnabled
                  ? "Собеседник включил видео"
                  : "Собеседник без видео"}
              </Text>

              <View style={styles.callControls}>
                <Pressable
                  style={[
                    styles.callControlButton,
                    isMicMuted ? styles.callControlButtonActive : null,
                  ]}
                  onPress={() => setIsMicMuted((value) => !value)}
                >
                  <Ionicons
                    name={isMicMuted ? "mic-off" : "mic"}
                    size={18}
                    color="#d8ecff"
                  />
                  <Text style={styles.callControlText}>
                    {isMicMuted ? "Микро off" : "Микро on"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.callControlButton,
                    isSpeakerOn ? styles.callControlButtonActive : null,
                  ]}
                  onPress={() => setIsSpeakerOn((value) => !value)}
                >
                  <Ionicons
                    name={isSpeakerOn ? "volume-high" : "volume-medium"}
                    size={18}
                    color="#d8ecff"
                  />
                  <Text style={styles.callControlText}>
                    {isSpeakerOn ? "Динамик on" : "Динамик off"}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.callControlButton,
                    isVideoEnabled ? styles.callControlButtonActive : null,
                  ]}
                  onPress={() => toggleVideo().catch(() => undefined)}
                >
                  <Ionicons
                    name={isVideoEnabled ? "videocam" : "videocam-off"}
                    size={18}
                    color="#d8ecff"
                  />
                  <Text style={styles.callControlText}>
                    {isVideoEnabled ? "Видео on" : "Видео off"}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.callEndButton}
                onPress={() => endCall().catch(() => undefined)}
              >
                <Ionicons name="call" size={18} color="#ffeef1" />
                <Text style={styles.callEndText}>Завершить звонок</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => handlePullToRefresh().catch(() => undefined)}
            tintColor="#dceeff"
            colors={["#65c0ff"]}
            progressBackgroundColor="#0f2438"
          />
        }
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: 16 + insets.top,
            paddingBottom: 24 + insets.bottom,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Pressable
              style={styles.burgerButton}
              onPress={onOpenMenu}
              accessibilityRole="button"
              accessibilityLabel="Открыть меню"
            >
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
              <View style={styles.burgerLine} />
            </Pressable>

            <View>
              <Text style={styles.title}>Чаты</Text>
            </View>
          </View>
        </View>

        {chats.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyText}>Чатов пока нет</Text>
          </View>
        ) : (
          <View style={styles.chatList}>
            {chats.map((chat) => (
              <Pressable
                key={chat.id}
                style={styles.chatRow}
                onPress={() => selectChat(chat.id)}
              >
                <View style={styles.chatAvatar}>
                  <Text style={styles.chatAvatarText}>
                    {chat.id === FAVORITES_CHAT_ID
                      ? "S"
                      : chat.resolvedTitle.slice(0, 1).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.chatInfoWrap}>
                  <Text style={styles.chatName}>{chat.resolvedTitle}</Text>
                  <Text style={styles.chatMeta}>
                    {buildChatSubtitle(
                      chat.id,
                      onlinePeerIdSet.has(chat.participantPeerId),
                    )}
                  </Text>
                </View>

                <View style={styles.chatRightWrap}>
                  <Text style={styles.chatTime}>
                    {formatChatTime(chat.lastMessageAt)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        transparent
        visible={isFabMenuOpen}
        animationType="fade"
        onRequestClose={() => setIsFabMenuOpen(false)}
      >
        <Pressable
          style={[
            styles.fabBackdrop,
            {
              paddingBottom: 20 + insets.bottom,
            },
          ]}
          onPress={() => setIsFabMenuOpen(false)}
        >
          <View style={styles.fabMenu}>
            <Pressable
              style={styles.fabAction}
              onPress={() => {
                setIsFabMenuOpen(false);
                navigation.navigate("Discovery");
              }}
            >
              <Text style={styles.fabActionTitle}>Найти рядом</Text>
              <Text style={styles.fabActionSubtitle}>
                Поиск устройств в локальной сети
              </Text>
            </Pressable>

            <Pressable
              style={styles.fabAction}
              onPress={() => {
                setIsFabMenuOpen(false);
                navigation.navigate("Pairing");
              }}
            >
              <Text style={styles.fabActionTitle}>Добавить по коду</Text>
              <Text style={styles.fabActionSubtitle}>
                Генерация или ввод случайной код-фразы
              </Text>
            </Pressable>

            <Pressable
              style={styles.fabCloseAction}
              onPress={() => setIsFabMenuOpen(false)}
            >
              <Text style={styles.fabCloseActionText}>Отмена</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Pressable
        style={[
          styles.fab,
          {
            bottom: 20 + insets.bottom,
          },
        ]}
        onPress={() => setIsFabMenuOpen(true)}
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}
