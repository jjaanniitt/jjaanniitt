import { Redirect, Tabs } from "expo-router";
import { House, ClipboardText, Package, Storefront } from "phosphor-react-native";
import { Platform } from "react-native";
import { useAuth } from "@/src/context/auth";
import { useTheme, fonts } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  if (loading) return null;
  if (!user) return <Redirect href="/login" />;

  if (usesNativeTabs) {
    const { NativeTabs } = require("expo-router/unstable-native-tabs");
    return (
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" />
          <NativeTabs.Trigger.Label>Panou</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="comenzi">
          <NativeTabs.Trigger.Icon sf="list.bullet.clipboard.fill" />
          <NativeTabs.Trigger.Label>Comenzi</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="produse">
          <NativeTabs.Trigger.Icon sf="shippingbox.fill" />
          <NativeTabs.Trigger.Label>Produse</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="colaboratori">
          <NativeTabs.Trigger.Icon sf="building.2.fill" />
          <NativeTabs.Trigger.Label>Parteneri</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.onSurface,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.borderStrong,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Panou", tabBarIcon: ({ color }) => <House size={22} color={color} weight="regular" /> }}
      />
      <Tabs.Screen
        name="comenzi"
        options={{ title: "Comenzi", tabBarIcon: ({ color }) => <ClipboardText size={22} color={color} weight="regular" /> }}
      />
      <Tabs.Screen
        name="produse"
        options={{ title: "Produse", tabBarIcon: ({ color }) => <Package size={22} color={color} weight="regular" /> }}
      />
      <Tabs.Screen
        name="colaboratori"
        options={{ title: "Parteneri", tabBarIcon: ({ color }) => <Storefront size={22} color={color} weight="regular" /> }}
      />
    </Tabs>
  );
}
