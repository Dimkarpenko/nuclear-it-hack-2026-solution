import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { HomeScreen } from "../../screens/HomeScreen";
import { PairingScreen } from "../../screens/PairingScreen";

export type RootStackParamList = {
  Home: undefined;
  Pairing: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "HEX Mesh Chat",
          headerStyle: { backgroundColor: "#101326" },
          headerTintColor: "#f2f5ff",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="Pairing"
        component={PairingScreen}
        options={{
          title: "Secure Pairing",
          headerStyle: { backgroundColor: "#101326" },
          headerTintColor: "#f2f5ff",
          headerShadowVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}
