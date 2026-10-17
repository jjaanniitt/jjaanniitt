import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CaretLeft } from "phosphor-react-native";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export function AppHeader({
  title, subtitle, onBack, right,
}: {
  title: string; subtitle?: string; onBack?: () => void; right?: ReactNode;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.wrap, { paddingTop: insets.top + 10 }]}>
      <View style={s.row}>
        {onBack ? (
          <Pressable testID="header-back" onPress={onBack} style={s.back} hitSlop={10}>
            <CaretLeft size={22} color={colors.onSurface} weight="bold" />
          </Pressable>
        ) : null}
        <View style={s.titleBox}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={s.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={s.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.borderStrong, paddingHorizontal: 16, paddingBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  back: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginLeft: -4 },
  titleBox: { flex: 1 },
  title: { fontFamily: fonts.displayMedium, fontSize: 24, color: c.onSurface, letterSpacing: -0.5 },
  sub: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, marginTop: 2 },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
}));
