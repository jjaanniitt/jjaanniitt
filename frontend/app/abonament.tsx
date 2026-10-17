import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Check } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { makeStyles, useTheme, fonts } from "@/src/theme";

const ORDER = ["free", "basic", "avansat", "pro"];

function features(key: string, p: any): string[] {
  const partners = p.max_partners == null ? "Parteneri nelimitati" : `${p.max_partners} ${p.max_partners === 1 ? "partener" : "parteneri"}`;
  const orders = p.max_orders_month == null ? "Comenzi nelimitate" : `${p.max_orders_month} comenzi / luna`;
  const base = [partners, orders];
  if (key === "free") base.push("Functii de baza");
  if (key === "basic") base.push("Foi de consignatie", "Rapoarte lunare");
  if (key === "avansat") base.push("Scanare cod de bare", "Export PDF", "Rapoarte avansate");
  if (key === "pro") base.push("Toate functiile", "Suport prioritar", "Fara limite");
  return base;
}

export default function Abonament() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({ queryKey: ["subscription"], queryFn: () => api<any>("/subscription") });
  const current = data?.plan ?? "free";
  const plans = data?.plans ?? {};

  const activate = useMutation({
    mutationFn: (plan: string) => api("/subscription/activate", { method: "POST", body: { plan } }),
    onSuccess: (_d, plan) => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      toast(`Plan activat: ${plans[plan]?.name ?? plan}`, "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  return (
    <View style={s.root}>
      <AppHeader title="Abonament" subtitle="Alege pachetul potrivit" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={s.intro}>Activarea platii reale se face dupa publicarea aplicatiei. Momentan poti activa planurile pentru a testa limitele.</Text>
        {ORDER.map((key) => {
          const p = plans[key];
          if (!p) return null;
          const active = key === current;
          return (
            <View key={key} style={[s.card, active && s.cardActive]} testID={`plan-${key}`}>
              <View style={s.cardHead}>
                <Text style={s.planName}>{p.name.toUpperCase()}</Text>
                <View style={s.priceBox}>
                  <Text style={s.price}>{p.price}</Text>
                  <Text style={s.priceUnit}> lei/luna</Text>
                </View>
              </View>
              <View style={s.feats}>
                {features(key, p).map((f, i) => (
                  <View key={i} style={s.feat}>
                    <Check size={14} color={colors.positive} weight="bold" />
                    <Text style={s.featText}>{f}</Text>
                  </View>
                ))}
              </View>
              {active ? (
                <View style={s.currentBadge}><Text style={s.currentText}>PLAN ACTIV</Text></View>
              ) : (
                <Btn title={p.price === 0 ? "Treci la Free" : `Activeaza ${p.name}`} onPress={() => activate.mutate(key)} loading={activate.isPending && activate.variables === key} testID={`activate-${key}`} />
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, gap: 14 },
  intro: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, lineHeight: 18 },
  card: { borderWidth: 1, borderColor: c.border, padding: 16, gap: 14, backgroundColor: c.surface },
  cardActive: { borderColor: c.borderStrong, borderWidth: 2 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  planName: { fontFamily: fonts.displayMedium, fontSize: 22, color: c.onSurface },
  priceBox: { flexDirection: "row", alignItems: "baseline" },
  price: { fontFamily: fonts.monoMedium, fontSize: 22, color: c.onSurface },
  priceUnit: { fontFamily: fonts.mono, fontSize: 12, color: c.muted },
  feats: { gap: 8 },
  feat: { flexDirection: "row", alignItems: "center", gap: 8 },
  featText: { fontFamily: fonts.mono, fontSize: 13, color: c.onSurfaceSecondary },
  currentBadge: { borderWidth: 1, borderColor: c.onSuccess, backgroundColor: c.success, paddingVertical: 12, alignItems: "center" },
  currentText: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1, color: c.onSuccess },
}));
