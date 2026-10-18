import { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Minus, Plus } from "phosphor-react-native";
import { makeStyles, useTheme, fonts } from "@/src/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type BtnVariant = "primary" | "secondary" | "outline" | "danger";

export function Btn({
  title, onPress, variant = "primary", disabled, loading, testID, icon,
}: {
  title: string; onPress: () => void; variant?: BtnVariant;
  disabled?: boolean; loading?: boolean; testID?: string; icon?: ReactNode;
}) {
  const s = useBtnStyles();
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const bg =
    variant === "primary" ? s.primary
    : variant === "secondary" ? s.secondary
    : variant === "danger" ? s.danger
    : s.outline;
  const txt =
    variant === "outline" ? { color: colors.onSurface }
    : variant === "secondary" ? { color: colors.onBrandSecondary }
    : { color: colors.onBrandPrimary };
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: isDisabled ? 0.5 : 1 }));
  return (
    <AnimatedPressable
      testID={testID}
      onPressIn={() => { if (!isDisabled) scale.value = withTiming(0.96, { duration: 90 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 220 }); }}
      onPress={() => { if (!isDisabled) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); } }}
      style={[s.base, bg, anim]}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={variant === "outline" ? colors.onSurface : colors.onBrandPrimary} />
      ) : (
        <View style={s.row}>
          {icon}
          <Text style={[s.label, txt]}>{title}</Text>
        </View>
      )}
    </AnimatedPressable>
  );
}

const useBtnStyles = makeStyles((c) => ({
  base: { minHeight: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, borderWidth: 1, borderColor: c.borderStrong },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  primary: { backgroundColor: c.brandPrimary },
  secondary: { backgroundColor: c.brandSecondary },
  danger: { backgroundColor: c.negative, borderColor: c.negative },
  outline: { backgroundColor: c.surface },
  disabled: { opacity: 0.4 },
  label: { fontFamily: fonts.monoMedium, fontSize: 14, letterSpacing: 0.5, textTransform: "uppercase" },
}));

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
export function StatusBadge({ status, testID }: { status: string; testID?: string }) {
  const s = useBadgeStyles();
  const kind = status === "Finalizat" ? "final" : status === "Partial" ? "partial" : "pending";
  return (
    <View testID={testID} style={[s.badge, s[kind]]}>
      <Text style={[s.text, s[`${kind}Text` as const]]}>{status.toUpperCase()}</Text>
    </View>
  );
}

const useBadgeStyles = makeStyles((c) => ({
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  final: { backgroundColor: c.success, borderColor: c.onSuccess },
  pending: { backgroundColor: c.warning, borderColor: c.onWarning },
  partial: { backgroundColor: c.info, borderColor: c.onInfo },
  text: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5 },
  finalText: { color: c.onSuccess },
  pendingText: { color: c.onWarning },
  partialText: { color: c.onInfo },
}));

// ---------------------------------------------------------------------------
// Initials block (brutalist square)
// ---------------------------------------------------------------------------
export function InitialsBlock({ text, size = 44 }: { text: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, backgroundColor: colors.surfaceInverse, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontFamily: fonts.monoMedium, color: colors.onSurfaceInverse, fontSize: size * 0.34 }}>{text}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------
export function Stepper({ value, onChange, testID }: { value: number; onChange: (v: number) => void; testID?: string }) {
  const s = useStepStyles();
  const { colors } = useTheme();
  const dec = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(Math.max(0, value - 1)); };
  const inc = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(value + 1); };
  return (
    <View style={s.wrap} testID={testID}>
      <Pressable style={s.btn} onPress={dec} testID={testID ? `${testID}-dec` : undefined}>
        <Minus size={16} color={colors.onSurface} weight="bold" />
      </Pressable>
      <View style={s.valBox}><Text style={s.val}>{value}</Text></View>
      <Pressable style={s.btn} onPress={inc} testID={testID ? `${testID}-inc` : undefined}>
        <Plus size={16} color={colors.onSurface} weight="bold" />
      </Pressable>
    </View>
  );
}

const useStepStyles = makeStyles((c) => ({
  wrap: { flexDirection: "row", borderWidth: 1, borderColor: c.borderStrong, alignItems: "center" },
  btn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  valBox: { minWidth: 42, height: 38, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.borderStrong },
  val: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
}));

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------
export function Field({ label, error, ...props }: { label: string; error?: boolean } & TextInputProps) {
  const s = useFieldStyles();
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        style={[s.input, error && s.inputError]}
        {...props}
      />
    </View>
  );
}

const useFieldStyles = makeStyles((c) => ({
  label: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.5, color: c.muted, textTransform: "uppercase" },
  input: { borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: 14, paddingVertical: 14, fontFamily: fonts.mono, fontSize: 16, color: c.onSurface, backgroundColor: c.surface },
  inputError: { borderColor: c.negative },
}));

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
export function EmptyState({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: ReactNode }) {
  const s = useEmptyStyles();
  return (
    <View style={s.wrap}>
      {icon}
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const useEmptyStyles = makeStyles((c) => ({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 56, gap: 10 },
  title: { fontFamily: fonts.displayMedium, fontSize: 16, color: c.onSurface, textAlign: "center" },
  sub: { fontFamily: fonts.mono, fontSize: 13, color: c.muted, textAlign: "center", paddingHorizontal: 32 },
}));

// ---------------------------------------------------------------------------
// Card (bordered container)
// ---------------------------------------------------------------------------
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[{ borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface }, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
export function Mono({ children, style }: { children: ReactNode; style?: any }) {
  return <Text style={[{ fontFamily: fonts.mono }, style]}>{children}</Text>;
}
