import { useCallback, useState } from "react";
import { Image } from "expo-image";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Camera, SignOut, Crown, CaretRight, User, Package } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, Card } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api, API_URL, TOKEN_KEY } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { uploadForm } from "@/src/utils/upload";
import { useAuth } from "@/src/context/auth";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function Cont() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { signOut } = useAuth();
  const { role } = useAuth();
  const [avatarV, setAvatarV] = useState(0);

  const meQ = useQuery({ queryKey: ["me"], queryFn: () => api<any>("/me") });
  const subQ = useQuery({ queryKey: ["subscription"], queryFn: () => api<any>("/subscription") });
  useFocusEffect(useCallback(() => { meQ.refetch(); subQ.refetch(); }, [meQ, subQ]));

  const me = meQ.data;
  const sub = subQ.data;

  const upload = useMutation({
    mutationFn: async (uri: string) => {
      const token = await storage.secureGet(TOKEN_KEY, "");
      const res = await uploadForm(`${API_URL}/me/avatar`, {
        headers: { Authorization: `Bearer ${token}` },
        files: { file: { uri, name: "avatar.jpg", mimeType: "image/jpeg" } },
      });
      if (!res.ok) throw new Error("Upload esuat");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me"] }); setAvatarV((v) => v + 1); toast("Poza actualizata", "success"); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast("Permite accesul la galerie", "error"); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, allowsEditing: true, aspect: [1, 1] });
    if (!res.canceled && res.assets[0]) upload.mutate(res.assets[0].uri);
  };

  const doLogout = async () => { await signOut(); router.replace("/login"); };

  const avatarUrl = me?.avatar_path ? `${API_URL}/me/avatar?user_id=${me.id}&v=${avatarV}` : null;
  const planName = sub?.limits?.name ?? "Free";

  return (
    <View style={s.root}>
      <AppHeader title="Cont" subtitle="Profil & abonament" />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}>
        <View style={s.profile}>
          <Pressable onPress={pickPhoto} style={s.avatarBox} testID="pick-avatar">
            {avatarUrl ? (
              <Image source={avatarUrl} style={s.avatar} contentFit="cover" />
            ) : (
              <User size={40} color={colors.onSurfaceInverse} />
            )}
            <View style={s.camBadge}><Camera size={14} color={colors.onSurfaceInverse} /></View>
          </Pressable>
          <Text style={s.name}>{me?.name || "Administrator"}</Text>
          <Text style={s.email}>{me?.email}</Text>
          <View style={s.roleBadge}>
            <Text style={s.roleText}>{role === "parent" ? "FIRMA MAMA" : "PARTENER"}</Text>
          </View>
        </View>

        {role === "parent" ? (
          <Pressable style={s.navCard} onPress={() => router.push("/depozit")} testID="open-depozit">
            <Package size={22} color={colors.onSurface} weight="fill" />
            <View style={{ flex: 1 }}>
              <Text style={s.planLabel}>STOC</Text>
              <Text style={s.planName}>Depozit central</Text>
            </View>
            <CaretRight size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        <Pressable style={s.planCard} onPress={() => router.push("/abonament")} testID="open-plans">
          <Crown size={22} color={colors.onSurface} weight="fill" />
          <View style={{ flex: 1 }}>
            <Text style={s.planLabel}>PLAN CURENT</Text>
            <Text style={s.planName}>{planName.toUpperCase()}</Text>
          </View>
          <CaretRight size={18} color={colors.muted} />
        </Pressable>

        {sub ? (
          <Card style={s.usage}>
            <View style={s.usageRow}>
              <Text style={s.usageLabel}>Parteneri</Text>
              <Text style={s.usageVal}>{sub.usage.partners} / {sub.limits.max_partners ?? "∞"}</Text>
            </View>
            <View style={[s.usageRow, s.usageDivider]}>
              <Text style={s.usageLabel}>Comenzi luna aceasta</Text>
              <Text style={s.usageVal}>{sub.usage.orders_month} / {sub.limits.max_orders_month ?? "∞"}</Text>
            </View>
          </Card>
        ) : null}

        <Btn title="Gestioneaza abonamentul" onPress={() => router.push("/abonament")} testID="manage-plan-button" />
        <Btn title="Deconectare" variant="outline" onPress={doLogout} icon={<SignOut size={18} color={colors.onSurface} weight="bold" />} testID="logout-button" />

        <Pressable onPress={() => router.push("/abonament")}>
          <Text style={s.footer}>Powered by Node Intelligence · nodeintelligence.ro</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, gap: 16 },
  profile: { alignItems: "center", gap: 8, paddingVertical: 16 },
  avatarBox: { width: 96, height: 96, backgroundColor: c.surfaceInverse, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  avatar: { width: 96, height: 96 },
  camBadge: { position: "absolute", bottom: -1, right: -1, width: 28, height: 28, backgroundColor: c.brandPrimary, borderWidth: 1, borderColor: c.surface, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.displayMedium, fontSize: 20, color: c.onSurface, marginTop: 6 },
  email: { fontFamily: fonts.mono, fontSize: 13, color: c.muted },
  roleBadge: { marginTop: 6, borderWidth: 1, borderColor: c.brandPrimary, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: c.brandPrimary },
  navCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.borderStrong, padding: 16, backgroundColor: c.surface },
  planCard: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.borderStrong, padding: 16, backgroundColor: c.surface },
  planLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, color: c.muted },
  planName: { fontFamily: fonts.monoMedium, fontSize: 18, color: c.onSurface, marginTop: 2 },
  usage: { padding: 0 },
  usageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 14 },
  usageDivider: { borderTopWidth: 1, borderTopColor: c.divider },
  usageLabel: { fontFamily: fonts.mono, fontSize: 13, color: c.onSurfaceSecondary },
  usageVal: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  footer: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: c.muted, textAlign: "center", marginTop: 12 },
}));
