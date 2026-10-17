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

const HERO = "https://images.pexels.com/photos/17483874/pexels-photo-17483874.png";

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
      <View style={s.hero}>
        <Image source={HERO} style={s.heroImg} contentFit="cover" />
        <LinearGradient colors={["rgba(17,17,17,0.55)", "rgba(17,17,17,0.95)"]} style={s.scrim} />
        <View style={[s.heroText, { paddingTop: insets.top + 24 }]}>
          <Text style={s.kicker}>NODE INTELLIGENCE</Text>
          <Text style={s.brand}>GESTIUNE{"\n"}LOGISTICA</Text>
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
  hero: { height: 260, backgroundColor: c.surfaceInverse },
  heroImg: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  heroText: { flex: 1, justifyContent: "flex-end", padding: 20 },
  kicker: { fontFamily: fonts.mono, fontSize: 12, color: "#FFFFFF", letterSpacing: 2, marginBottom: 8 },
  brand: { fontFamily: fonts.displayMedium, fontSize: 38, color: "#FFFFFF", lineHeight: 40, letterSpacing: -1 },
  formWrap: { flex: 1 },
  formContent: { padding: 20, gap: 16 },
  formTitle: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1.5, color: c.muted, marginBottom: 2 },
  footer: { marginTop: 24, alignItems: "center", gap: 4 },
  footerText: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: c.muted },
  footerLink: { fontFamily: fonts.monoMedium, fontSize: 12, color: c.onSurface, textDecorationLine: "underline" },
}));
