import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { X, Check, Plus, Package } from "phosphor-react-native";
import { Btn, Stepper } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function Depozit() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();

  const [modal, setModal] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});

  const q = useQuery({ queryKey: ["central-stock"], queryFn: () => api<any>("/central-stock") });
  const rows = q.data?.rows ?? [];

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    rows.forEach((p: any) => { (map[p.category] ||= []).push(p); });
    return Object.entries(map);
  }, [rows]);

  const itemCount = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  const submit = useMutation({
    mutationFn: () => {
      const items = rows.filter((p: any) => (qty[p.id] || 0) > 0).map((p: any) => ({ product_id: p.id, qty: qty[p.id] }));
      return api("/central-stock/reception", { method: "POST", body: { items } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["central-stock"] });
      setModal(false); setQty({});
      toast("Receptie inregistrata in depozit", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.head}>
        <Pressable onPress={() => router.back()} testID="close-depozit"><X size={22} color={colors.onSurface} /></Pressable>
        <Text style={s.headTitle}>DEPOZIT CENTRAL</Text>
        <Pressable onPress={() => setModal(true)} testID="open-reception" hitSlop={8}><Plus size={22} color={colors.brandPrimary} weight="bold" /></Pressable>
      </View>

      <View style={s.kpis}>
        <View style={s.kpi}>
          <Text style={s.kpiVal} testID="central-total">{q.data?.total_central ?? 0}</Text>
          <Text style={s.kpiLabel}>IN DEPOZIT</Text>
        </View>
        <View style={s.kpi}>
          <Text style={s.kpiVal}>{q.data?.total_consigned ?? 0}</Text>
          <Text style={s.kpiLabel}>LA PARTENERI</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {groups.map(([cat, items]) => (
          <View key={cat} style={s.group}>
            <Text style={s.groupTitle}>{cat.toUpperCase()}</Text>
            {items.map((p: any) => (
              <View key={p.id} style={s.prodRow} testID={`central-${p.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={s.prodName}>{p.variant} {p.size}</Text>
                </View>
                <Text style={[s.qtyVal, p.quantity <= 0 && s.zero]}>{p.quantity}</Text>
              </View>
            ))}
          </View>
        ))}
        <Pressable style={s.recBtn} onPress={() => setModal(true)} testID="reception-cta">
          <Package size={18} color={colors.onSurface} />
          <Text style={s.recText}>RECEPTIE MARFA IN DEPOZIT</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={modal} transparent animationType="slide" onRequestClose={() => setModal(false)}>
        <View style={s.backdrop}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 16, maxHeight: "86%" }]}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>RECEPTIE MARFA</Text>
              <Pressable onPress={() => setModal(false)} testID="close-reception"><X size={20} color={colors.onSurface} /></Pressable>
            </View>
            <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" bottomOffset={20}>
              {groups.map(([cat, items]) => (
                <View key={cat} style={s.group}>
                  <Text style={s.groupTitle}>{cat.toUpperCase()}</Text>
                  {items.map((p: any) => (
                    <View key={p.id} style={s.prodRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.prodName}>{p.variant} {p.size}</Text>
                        <Text style={s.prodBar}>in stoc: {p.quantity}</Text>
                      </View>
                      <Stepper value={qty[p.id] || 0} onChange={(v) => setQty((s0) => ({ ...s0, [p.id]: v }))} testID={`rec-stepper-${p.id}`} />
                    </View>
                  ))}
                </View>
              ))}
            </KeyboardAwareScrollView>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>TOTAL RECEPTIE</Text>
              <Text style={s.totalValue} testID="rec-total">{itemCount} buc</Text>
            </View>
            <Btn title="Inregistreaza receptia" onPress={() => submit.mutate()} disabled={itemCount === 0 || submit.isPending} loading={submit.isPending} icon={<Check size={18} color={colors.onBrandPrimary} weight="bold" />} testID="submit-reception" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.borderStrong },
  headTitle: { fontFamily: fonts.monoMedium, fontSize: 14, letterSpacing: 1, color: c.onSurface },
  kpis: { flexDirection: "row", gap: 12, padding: 16 },
  kpi: { flex: 1, borderWidth: 1, borderColor: c.borderStrong, padding: 16, backgroundColor: c.surfaceSecondary },
  kpiVal: { fontFamily: fonts.displayMedium, fontSize: 30, color: c.onSurface },
  kpiLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: c.muted, marginTop: 4 },
  content: { padding: 16, paddingTop: 0, gap: 12, paddingBottom: 24 },
  group: { borderWidth: 1, borderColor: c.border },
  groupTitle: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.5, color: c.onSurfaceInverse, backgroundColor: c.surfaceInverse, paddingHorizontal: 12, paddingVertical: 6 },
  prodRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.divider },
  prodName: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface },
  prodBar: { fontFamily: fonts.mono, fontSize: 10, color: c.muted, marginTop: 2 },
  qtyVal: { fontFamily: fonts.monoMedium, fontSize: 18, color: c.onSurface },
  zero: { color: c.muted },
  recBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: c.borderStrong, paddingVertical: 14, backgroundColor: c.surfaceSecondary, marginTop: 4 },
  recText: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 0.5, color: c.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 12 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  totalLabel: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 0.5, color: c.muted },
  totalValue: { fontFamily: fonts.monoMedium, fontSize: 20, color: c.onSurface },
}));
