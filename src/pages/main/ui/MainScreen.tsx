import { useEffect, useState } from "react";
import { Modal, Pressable, Switch, Text, TextInput, View } from "react-native";
import {
  createDrawerNavigator,
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerNavigationProp,
} from "@react-navigation/drawer";
import { useNavigation } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RootStackParamList } from "@/core/navigation/RootNavigator";
import { getDiscoveryService } from "@/features/discovery";
import {
  getOrCreateDeviceIdentity,
  isProfileNameRequired,
  updateDeviceDisplayName,
} from "@/features/security";
import { ChatScreen } from "@/pages/chat";
import { SettingsScreen } from "@/pages/settings";

import { styles } from "./MainScreen.styles";

type MainDrawerParamList = {
  Chats: undefined;
  Settings: undefined;
};

const Drawer = createDrawerNavigator<MainDrawerParamList>();

type Props = NativeStackScreenProps<RootStackParamList, "Main">;

type OpenChatRequest = {
  peerId: string;
  peerName?: string;
  token: number;
} | null;

type DrawerContentProps = DrawerContentComponentProps & {
  profileName: string;
  isDarkThemeEnabled: boolean;
  onToggleDarkTheme: (value: boolean) => void;
};

function MainDrawerContent({
  navigation,
  profileName,
  isDarkThemeEnabled,
  onToggleDarkTheme,
}: DrawerContentProps) {
  const insets = useSafeAreaInsets();
  const initial = profileName.slice(0, 1).toUpperCase() || "U";

  return (
    <DrawerContentScrollView
      contentContainerStyle={[
        styles.drawerContent,
        {
          paddingTop: insets.top + 18,
          paddingBottom: insets.bottom + 18,
        },
      ]}
    >
      <View style={styles.drawerProfileBlock}>
        <View style={styles.drawerAvatar}>
          <Text style={styles.drawerAvatarText}>{initial}</Text>
        </View>
        <Text style={styles.drawerProfileTitle}>{profileName}</Text>
        <Text style={styles.drawerProfileSubtitle}>Локальный мессенджер</Text>
      </View>

      <View style={styles.drawerSection}>
        <Pressable
          style={styles.drawerItem}
          onPress={() => navigation.navigate("Settings")}
        >
          <Text style={styles.drawerItemLabel}>Настройки</Text>
        </Pressable>

        <View style={styles.drawerToggleRow}>
          <Text style={styles.drawerItemLabel}>Темная тема</Text>
          <Switch
            value={isDarkThemeEnabled}
            onValueChange={onToggleDarkTheme}
          />
        </View>

        <Text style={styles.drawerHint}>
          Заглушка: переключатель пока не применяет тему в приложении.
        </Text>
      </View>
    </DrawerContentScrollView>
  );
}

function ChatsRoute({
  openChatRequest,
  onOpenChatHandled,
}: {
  openChatRequest: OpenChatRequest;
  onOpenChatHandled: () => void;
}) {
  const navigation = useNavigation<DrawerNavigationProp<MainDrawerParamList>>();

  return (
    <ChatScreen
      onOpenMenu={() => navigation.openDrawer()}
      openChatRequest={openChatRequest}
      onOpenChatHandled={onOpenChatHandled}
    />
  );
}

function SettingsRoute({
  shouldOpenChats,
  onDisplayNameChanged,
}: {
  shouldOpenChats: boolean;
  onDisplayNameChanged: (name: string) => void;
}) {
  const navigation = useNavigation<DrawerNavigationProp<MainDrawerParamList>>();

  useEffect(() => {
    if (!shouldOpenChats) {
      return;
    }

    navigation.navigate("Chats");
  }, [navigation, shouldOpenChats]);

  return (
    <SettingsScreen
      onBack={() => navigation.navigate("Chats")}
      onDisplayNameChanged={onDisplayNameChanged}
    />
  );
}

export function MainScreen({ route }: Props) {
  const service = getDiscoveryService();
  const [isDarkThemeEnabled, setIsDarkThemeEnabled] = useState(false);
  const [openChatRequest, setOpenChatRequest] = useState<OpenChatRequest>(null);
  const [profileName, setProfileName] = useState("Пользователь");
  const [isProfilePromptVisible, setIsProfilePromptVisible] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [isSavingProfileName, setIsSavingProfileName] = useState(false);
  const [profilePromptError, setProfilePromptError] = useState("");

  const applyProfileName = async (value: string) => {
    const safe = value.trim();
    if (!safe) {
      return;
    }

    const updated = await updateDeviceDisplayName(safe);
    service.start(updated);
    setProfileName(updated.displayName);
    setProfileNameDraft(updated.displayName);
    setProfilePromptError("");
  };

  const submitInitialProfileName = async () => {
    const safe = profileNameDraft.trim();
    if (!safe) {
      setProfilePromptError("Введите имя");
      return;
    }

    setIsSavingProfileName(true);
    try {
      await applyProfileName(safe);
      setIsProfilePromptVisible(false);
    } finally {
      setIsSavingProfileName(false);
    }
  };

  useEffect(() => {
    getOrCreateDeviceIdentity()
      .then((identity) => {
        setProfileName(identity.displayName);
        if (isProfileNameRequired(identity)) {
          setProfileNameDraft("");
          setIsProfilePromptVisible(true);
        } else {
          setProfileNameDraft(identity.displayName);
          setIsProfilePromptVisible(false);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const peerId = route.params?.openPeerId;
    if (!peerId) {
      return;
    }

    const token = route.params?.openAt ?? Date.now();
    setOpenChatRequest({
      peerId,
      peerName: route.params?.openPeerName,
      token,
    });
  }, [
    route.params?.openAt,
    route.params?.openPeerId,
    route.params?.openPeerName,
  ]);

  return (
    <View style={styles.container}>
      <Drawer.Navigator
        initialRouteName="Chats"
        screenOptions={{
          headerShown: false,
          drawerType: "front",
          overlayColor: "rgba(5, 12, 20, 0.52)",
          sceneStyle: styles.scene,
          drawerStyle: styles.drawerPanel,
          swipeEdgeWidth: 28,
        }}
        drawerContent={(props) => (
          <MainDrawerContent
            {...props}
            profileName={profileName}
            isDarkThemeEnabled={isDarkThemeEnabled}
            onToggleDarkTheme={setIsDarkThemeEnabled}
          />
        )}
      >
        <Drawer.Screen name="Chats">
          {() => (
            <ChatsRoute
              openChatRequest={openChatRequest}
              onOpenChatHandled={() => setOpenChatRequest(null)}
            />
          )}
        </Drawer.Screen>
        <Drawer.Screen name="Settings">
          {() => (
            <SettingsRoute
              shouldOpenChats={openChatRequest !== null}
              onDisplayNameChanged={(name) => {
                setProfileName(name);
              }}
            />
          )}
        </Drawer.Screen>
      </Drawer.Navigator>

      <Modal
        transparent
        visible={isProfilePromptVisible}
        animationType="fade"
        onRequestClose={() => undefined}
      >
        <View style={styles.profilePromptBackdrop}>
          <View style={styles.profilePromptCard}>
            <Text style={styles.profilePromptTitle}>Как тебя зовут?</Text>
            <Text style={styles.profilePromptSubtitle}>
              Укажи имя. Его будут видеть собеседники в чате.
            </Text>

            <TextInput
              value={profileNameDraft}
              onChangeText={(value) => {
                setProfileNameDraft(value);
                if (profilePromptError) {
                  setProfilePromptError("");
                }
              }}
              style={styles.profilePromptInput}
              placeholder="Твое имя"
              placeholderTextColor="#80a0be"
              autoCapitalize="words"
              autoCorrect={false}
              editable={!isSavingProfileName}
              maxLength={40}
            />

            {profilePromptError ? (
              <Text style={styles.profilePromptError}>
                {profilePromptError}
              </Text>
            ) : null}

            <Pressable
              style={[
                styles.profilePromptButton,
                isSavingProfileName ? styles.profilePromptButtonDisabled : null,
              ]}
              onPress={() => submitInitialProfileName().catch(() => undefined)}
              disabled={isSavingProfileName}
            >
              <Text style={styles.profilePromptButtonText}>
                {isSavingProfileName ? "Сохранение..." : "Продолжить"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
