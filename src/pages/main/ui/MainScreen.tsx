import { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
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
  isDarkThemeEnabled: boolean;
  onToggleDarkTheme: (value: boolean) => void;
};

function MainDrawerContent({
  navigation,
  isDarkThemeEnabled,
  onToggleDarkTheme,
}: DrawerContentProps) {
  const insets = useSafeAreaInsets();

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
          <Text style={styles.drawerAvatarText}>M</Text>
        </View>
        <Text style={styles.drawerProfileTitle}>HexMesh Chat</Text>
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

function SettingsRoute({ shouldOpenChats }: { shouldOpenChats: boolean }) {
  const navigation = useNavigation<DrawerNavigationProp<MainDrawerParamList>>();

  useEffect(() => {
    if (!shouldOpenChats) {
      return;
    }

    navigation.navigate("Chats");
  }, [navigation, shouldOpenChats]);

  return <SettingsScreen onBack={() => navigation.navigate("Chats")} />;
}

export function MainScreen({ route }: Props) {
  const [isDarkThemeEnabled, setIsDarkThemeEnabled] = useState(false);
  const [openChatRequest, setOpenChatRequest] = useState<OpenChatRequest>(null);

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
          {() => <SettingsRoute shouldOpenChats={openChatRequest !== null} />}
        </Drawer.Screen>
      </Drawer.Navigator>
    </View>
  );
}
