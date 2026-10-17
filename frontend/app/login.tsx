import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { makeStyles, fonts } from "@/src/theme";
import { Btn, Field } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";
import { useToast } from "@/src/components/toast";
import { ApiError } from "@/src/api/client";

const MARK = require("@/assets/images/node-mark.png");

export default function Login() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("detergentzilnic@gmail.com");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { setError(true); toast("Completeaza email si parola", "error"); return; }
    setLoading(true);
    setError(false);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      setError(true);
      toast(e instanceof ApiError ? e.message : "Autentificare esuata", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.root}>
      <LinearGradient
        colors={["#2A2C96", "#0A0B2E", "#05061C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={s.hero}
      >
        <View style={[s.heroInner, { paddingTop: insets.top + 32 }]}>
          <View style={s.logoRow}>
            <Image source={MARK} style={s.mark} contentFit="contain" />
            <View style={s.divider} />
            <View style={s.wordmark}>
              <Text style={s.node}>NODE</Text>
              <Text style={s.gest}>GEST</Text>
            </View>
          </View>
          <Text style={s.kicker}>GESTIUNE LOGISTICA</Text>
        </View>
      </LinearGradient>

      <KeyboardAwareScrollView
        style={s.formWrap}
        contentContainerStyle={s.formContent}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text style={s.formTitle}>AUTENTIFICARE</Text>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="email@exemplu.ro"
          error={error}
          testID="login-email-input"
        />
        <Field
          label="Parola"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          error={error}
          testID="login-password-input"
          onSubmitEditing={submit}
        />
        <Btn title="Intra in cont" onPress={submit} loading={loading} testID="login-submit-button" />

        <Pressable
          style={[s.footer, { marginBottom: insets.bottom + 8 }]}
          onPress={() => Linking.openURL("https://nodeintelligence.ro")}
          testID="node-intelligence-link"
        >
          <Text style={s.footerText}>POWERED BY NODE INTELLIGENCE</Text>
          <Text style={s.footerLink}>nodeintelligence.ro</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { height: 280 },
  heroInner: { flex: 1, justifyContent: "flex-end", paddingHorizontal: 24, paddingBottom: 28 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  mark: { width: 70, height: 80 },
  divider: { width: 5, height: 72, borderRadius: 3, backgroundColor: "#FFFFFF" },
  wordmark: { justifyContent: "center" },
  node: { fontFamily: fonts.displayMedium, fontSize: 40, color: "#FFFFFF", lineHeight: 42, letterSpacing: -1 },
  gest: { fontFamily: fonts.displayMedium, fontSize: 40, color: "#7C84FF", lineHeight: 42, letterSpacing: -1 },
  kicker: { fontFamily: fonts.mono, fontSize: 12, color: "rgba(255,255,255,0.7)", letterSpacing: 3, marginTop: 18 },
  formWrap: { flex: 1 },
  formContent: { padding: 20, gap: 16 },
  formTitle: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1.5, color: c.muted, marginBottom: 2 },
  footer: { marginTop: 24, alignItems: "center", gap: 4 },
  footerText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: c.muted },
  footerLink: { fontFamily: fonts.monoMedium, fontSize: 12, color: c.onSurface, textDecorationLine: "underline" },
}));
