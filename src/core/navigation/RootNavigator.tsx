import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { DiscoveryScreen } from "@/pages/discovery";
import { HomeScreen } from "@/pages/home";
import { PairingScreen } from "@/pages/pairing";

export type RootStackParamList = {
  Home: undefined;
  Pairing: undefined;
  Discovery: undefined;
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
      <Stack.Screen
        name="Discovery"
        component={DiscoveryScreen}
        options={{
          title: "Discovery",
          headerStyle: { backgroundColor: "#101326" },
          headerTintColor: "#f2f5ff",
          headerShadowVisible: false,
        }}
      />
    </Stack.Navigator>
  );
}
