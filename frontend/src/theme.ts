// Brutalist Mobile LIGHT theme — tokens mirror design_guidelines.json "color".
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FFFFFF",
  onSurface: "#111111",
  surfaceSecondary: "#F4F4F5",
  onSurfaceSecondary: "#111111",
  surfaceTertiary: "#E4E4E7",
  onSurfaceTertiary: "#111111",
  surfaceInverse: "#111111",
  onSurfaceInverse: "#FFFFFF",
  muted: "#71717A",

  brand: "#111111",
  onBrand: "#FFFFFF",
  brandPrimary: "#111111",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#52525B",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E4E4E7",
  onBrandTertiary: "#111111",

  // Status fills (pale bg + strong on-text)
  success: "#E3FCEF",
  onSuccess: "#0F5132",
  warning: "#FFF3CD",
  onWarning: "#664D03",
  error: "#F8D7DA",
  onError: "#842029",
  info: "#E2E3E5",
  onInfo: "#383D41",

  // Strong signal colors (text / emphasis)
  negative: "#B42318",
  positive: "#0F5132",

  border: "#D4D4D8",
  borderStrong: "#111111",
  divider: "#E4E4E7",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const fonts = {
  display: "SpaceGrotesk-Regular",
  displayMedium: "SpaceGrotesk-Medium",
  mono: "IBMPlexMono-Regular",
  monoMedium: "IBMPlexMono-Medium",
};

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
