import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { HomeScreen } from "../../screens/HomeScreen";

export type RootStackParamList = {
  Home: undefined;
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
    </Stack.Navigator>
  );
}
