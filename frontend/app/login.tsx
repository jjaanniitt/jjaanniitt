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

const HERO = require("@/assets/images/node-hero.png");

export default function Login() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState("");
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
      <View style={s.hero}>
        <Image source={HERO} style={s.heroImg} contentFit="cover" />
        <LinearGradient colors={["rgba(10,14,31,0)", "rgba(10,14,31,0.4)", "#0A0E1F"]} style={s.scrim} />
        <View style={[s.heroText, { paddingTop: insets.top + 16 }]}>
          <Text style={s.kicker}>GESTIUNE · LOGISTICA · FACTURARE</Text>
        </View>
      </View>

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

        <View style={s.regRow}>
          <Pressable style={s.regBtn} onPress={() => router.push("/register?mode=parent")} testID="go-register-parent">
            <Text style={s.regTitle}>Firma noua</Text>
            <Text style={s.regSub}>Creeaza cont firma-mama</Text>
          </Pressable>
          <Pressable style={s.regBtn} onPress={() => router.push("/register?mode=partner")} testID="go-register-partner">
            <Text style={s.regTitle}>Am invitatie</Text>
            <Text style={s.regSub}>Inregistrare partener</Text>
          </Pressable>
        </View>

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
  hero: { height: 300, backgroundColor: c.surface },
  heroImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroText: { flex: 1, justifyContent: "flex-start", alignItems: "center" },
  kicker: { fontFamily: fonts.mono, fontSize: 11, color: "rgba(255,255,255,0.7)", letterSpacing: 2 },
  formWrap: { flex: 1 },
  formContent: { padding: 20, gap: 16 },
  formTitle: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1.5, color: c.muted, marginBottom: 2 },
  regRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  regBtn: { flex: 1, borderWidth: 1, borderColor: c.borderStrong, padding: 14, gap: 4, backgroundColor: c.surfaceSecondary },
  regTitle: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurface },
  regSub: { fontFamily: fonts.mono, fontSize: 10, color: c.muted },
  footer: { marginTop: 24, alignItems: "center", gap: 4 },
  footerText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: c.muted },
  footerLink: { fontFamily: fonts.monoMedium, fontSize: 12, color: c.onSurface, textDecorationLine: "underline" },
}));
