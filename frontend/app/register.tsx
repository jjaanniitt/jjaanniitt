import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { CaretLeft } from "phosphor-react-native";
import { makeStyles, fonts, useTheme } from "@/src/theme";
import { Btn, Field } from "@/src/components/ui";
import { useAuth } from "@/src/context/auth";
import { useToast } from "@/src/components/toast";
import { ApiError } from "@/src/api/client";

export default function Register() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const { registerParent, registerPartner } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState<"parent" | "partner">(mode === "partner" ? "partner" : "parent");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [invite, setInvite] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 6) { toast("Email valid si parola de minim 6 caractere", "error"); return; }
    setLoading(true);
    try {
      if (tab === "parent") {
        if (!orgName.trim()) { toast("Introdu numele firmei", "error"); setLoading(false); return; }
        await registerParent(email.trim(), password, orgName.trim());
      } else {
        if (!invite.trim()) { toast("Introdu codul de invitatie", "error"); setLoading(false); return; }
        await registerPartner(email.trim(), password, invite.trim());
      }
      router.replace("/(tabs)");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Inregistrare esuata", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()} testID="register-back" hitSlop={10}>
          <CaretLeft size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={s.title}>CONT NOU</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" bottomOffset={20}>
        <View style={s.segment}>
          <Pressable style={[s.seg, tab === "parent" && s.segActive]} onPress={() => setTab("parent")} testID="tab-parent">
            <Text style={[s.segText, tab === "parent" && s.segTextActive]}>FIRMA MAMA</Text>
          </Pressable>
          <Pressable style={[s.seg, tab === "partner" && s.segActive]} onPress={() => setTab("partner")} testID="tab-partner">
            <Text style={[s.segText, tab === "partner" && s.segTextActive]}>PARTENER</Text>
          </Pressable>
        </View>

        <Text style={s.hint}>
          {tab === "parent"
            ? "Creezi contul firmei-mama. Vei putea adauga parteneri, depozit central si facturare."
            : "Ai primit un cod de invitatie de la firma-mama. Introdu-l mai jos pentru a-ti crea contul de partener."}
        </Text>

        {tab === "parent" && (
          <Field label="Numele firmei" value={orgName} onChangeText={setOrgName} placeholder="ex. Node Distributie SRL" testID="reg-org-input" />
        )}
        {tab === "partner" && (
          <Field label="Cod invitatie" value={invite} onChangeText={(v) => setInvite(v.toUpperCase())} autoCapitalize="characters" placeholder="ex. EBJFOUOE0CWB" testID="reg-invite-input" />
        )}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="email@exemplu.ro" testID="reg-email-input" />
        <Field label="Parola (min. 6)" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" testID="reg-password-input" onSubmitEditing={submit} />

        <Btn title={tab === "parent" ? "Creeaza firma" : "Alatura-te"} onPress={submit} loading={loading} testID="register-submit" />
        <Pressable onPress={() => router.replace("/login")} style={s.loginLink} testID="go-login">
          <Text style={s.loginText}>Ai deja cont? Autentifica-te</Text>
        </Pressable>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.borderStrong },
  title: { fontFamily: fonts.monoMedium, fontSize: 14, letterSpacing: 1, color: c.onSurface },
  content: { padding: 20, gap: 16 },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: c.borderStrong },
  seg: { flex: 1, paddingVertical: 12, alignItems: "center", backgroundColor: c.surface },
  segActive: { backgroundColor: c.brandPrimary },
  segText: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1, color: c.onSurface },
  segTextActive: { color: c.onBrandPrimary },
  hint: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, lineHeight: 18 },
  loginLink: { alignItems: "center", marginTop: 8 },
  loginText: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, textDecorationLine: "underline" },
}));
