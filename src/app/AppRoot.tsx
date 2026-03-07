import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RootNavigator } from "./navigation/RootNavigator";

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
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={appTheme}>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
