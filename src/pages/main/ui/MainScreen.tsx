import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ChatScreen } from "@/pages/chat";
import { SettingsScreen } from "@/pages/settings";

import { styles } from "./MainScreen.styles";

type TabKey = "chats" | "settings";

export function MainScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>("chats");

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {activeTab === "chats" ? <ChatScreen /> : <SettingsScreen />}
      </View>

      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          <Pressable
            style={styles.tabButton}
            onPress={() => setActiveTab("chats")}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === "chats" ? styles.tabLabelActive : null,
              ]}
            >
              Чаты
            </Text>
          </Pressable>

          <Pressable
            style={styles.tabButton}
            onPress={() => setActiveTab("settings")}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === "settings" ? styles.tabLabelActive : null,
              ]}
            >
              Настройки
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
