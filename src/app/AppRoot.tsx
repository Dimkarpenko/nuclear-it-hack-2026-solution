import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useEffect, useState } from "react";

import { RootNavigator } from "./navigation/RootNavigator";
import { initializeDatabase } from "../storage/database";

const appTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#090b14",
    card: "#101326",
    border: "#2b3154",
    text: "#f2f5ff",
    primary: "#57d3ff",
  },
};

export function AppRoot() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    initializeDatabase()
      .catch(() => undefined)
      .finally(() => {
        if (mounted) {
          setIsReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!isReady) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#57d3ff" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={appTheme}>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#090b14",
  },
});
