// Brutalist Mobile LIGHT theme — tokens mirror design_guidelines.json "color".
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#0A0E1F",
  onSurface: "#F4F6FF",
  surfaceSecondary: "#121833",
  onSurfaceSecondary: "#F4F6FF",
  surfaceTertiary: "#1B2240",
  onSurfaceTertiary: "#F4F6FF",
  surfaceInverse: "#E9ECFF",
  onSurfaceInverse: "#0A0E1F",
  muted: "#8A93B2",

  brand: "#4F5DFF",
  onBrand: "#FFFFFF",
  brandPrimary: "#4F5DFF",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#2A3357",
  onBrandSecondary: "#F4F6FF",
  brandTertiary: "#1B2240",
  onBrandTertiary: "#F4F6FF",

  // Status fills (dark bg + bright on-text)
  success: "#0E2A1E",
  onSuccess: "#5BE3A7",
  warning: "#2E2410",
  onWarning: "#FFD166",
  error: "#2E1518",
  onError: "#FF8A9B",
  info: "#161B33",
  onInfo: "#AEB6D8",

  // Strong signal colors (text / emphasis)
  negative: "#FF6B6B",
  positive: "#5BE3A7",

  border: "#242C4D",
  borderStrong: "#3A4470",
  divider: "#1C2340",
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
