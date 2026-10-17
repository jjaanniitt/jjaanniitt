import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { X, Check, Barcode } from "phosphor-react-native";
import { Btn, Field, Stepper } from "@/src/components/ui";
import { BarcodeScanner } from "@/src/components/barcode-scanner";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function Consignatie() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { collabId } = useLocalSearchParams<{ collabId: string }>();

  const [pv, setPv] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [scanner, setScanner] = useState(false);
  const [scanTarget, setScanTarget] = useState<any | null>(null);
  const [scanQty, setScanQty] = useState("1");

  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => api<any[]>("/products") });

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    (productsQ.data ?? []).forEach((p) => { (map[p.category] ||= []).push(p); });
    return Object.entries(map);
  }, [productsQ.data]);

  const itemCount = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  const onScanned = (code: string) => {
    setScanner(false);
    const p = (productsQ.data ?? []).find((x) => x.barcode && x.barcode === code);
    if (!p) { toast("Cod necunoscut. Aloca-l unui produs in Produse.", "error"); return; }
    setScanTarget(p);
    setScanQty("1");
  };

  const confirmScanQty = () => {
    const add = parseInt(scanQty || "0", 10);
    if (scanTarget && add > 0) {
      setQty((q) => ({ ...q, [scanTarget.id]: (q[scanTarget.id] || 0) + add }));
      toast(`+${add} ${scanTarget.variant} ${scanTarget.size}`, "success");
    }
    setScanTarget(null);
  };

  const submit = useMutation({
    mutationFn: () => {
      const items = (productsQ.data ?? []).filter((p) => (qty[p.id] || 0) > 0).map((p) => ({ product_id: p.id, qty: qty[p.id] }));
      return api(`/collaborators/${collabId}/consignments`, { method: "POST", body: { pv_number: pv, items } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborator", collabId] });
      qc.invalidateQueries({ queryKey: ["collaborators"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("Intrare in consignatie salvata", "success");
      router.back();
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const canSubmit = pv.trim() && itemCount > 0 && !submit.isPending;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.head}>
        <Text style={s.headTitle}>FOAIE CONSIGNATIE</Text>
        <Pressable onPress={() => router.back()} testID="close-consignment"><X size={22} color={colors.onSurface} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Field label="Nr. proces verbal" value={pv} onChangeText={setPv} placeholder="ex. PV-2026-001" testID="pv-input" />

        <Pressable style={s.scanBtn} onPress={() => setScanner(true)} testID="scan-consignment">
          <Barcode size={20} color={colors.onSurface} />
          <Text style={s.scanText}>SCANEAZA COD DE BARE</Text>
        </Pressable>

        <Text style={s.section}>PRODUSE DATE IN CONSIGNATIE</Text>
        {groups.map(([cat, items]) => (
          <View key={cat} style={s.group}>
            <Text style={s.groupTitle}>{cat.toUpperCase()}</Text>
            {items.map((p) => (
              <View key={p.id} style={s.prodRow} testID={`cons-product-${p.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={s.prodName}>{p.variant} {p.size}</Text>
                  {p.barcode ? <Text style={s.prodBar}>{p.barcode}</Text> : null}
                </View>
                <Stepper value={qty[p.id] || 0} onChange={(v) => setQty((q) => ({ ...q, [p.id]: v }))} testID={`cons-stepper-${p.id}`} />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>TOTAL INTRARE</Text>
          <Text style={s.totalValue} testID="cons-total">{itemCount} buc</Text>
        </View>
        <Btn title="Salveaza intrarea" onPress={() => submit.mutate()} disabled={!canSubmit} loading={submit.isPending} icon={<Check size={18} color={colors.onBrandPrimary} weight="bold" />} testID="submit-consignment" />
      </View>

      <BarcodeScanner visible={scanner} onClose={() => setScanner(false)} onScanned={onScanned} />

      <Modal visible={!!scanTarget} transparent animationType="fade" onRequestClose={() => setScanTarget(null)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>CANTITATE</Text>
                <Pressable onPress={() => setScanTarget(null)} testID="close-scan-qty"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Text style={s.scanProd}>{scanTarget?.variant} {scanTarget?.size}</Text>
              <View style={s.scanQtyRow}>
                <Stepper value={parseInt(scanQty || "0", 10) || 0} onChange={(v) => setScanQty(String(v))} testID="scan-qty-stepper" />
                <View style={{ flex: 1 }}>
                  <Field label="Bucati" value={scanQty} onChangeText={(v) => setScanQty(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" testID="scan-qty-input" />
                </View>
              </View>
              <Btn title="Adauga in intrare" onPress={confirmScanQty} disabled={!parseInt(scanQty || "0", 10)} testID="confirm-scan-qty" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.borderStrong },
  headTitle: { fontFamily: fonts.monoMedium, fontSize: 14, letterSpacing: 1, color: c.onSurface },
  content: { padding: 16, paddingBottom: 24, gap: 12 },
  scanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: c.borderStrong, paddingVertical: 14, backgroundColor: c.surfaceSecondary },
  scanText: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 0.5, color: c.onSurface },
  section: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: c.muted, marginTop: 4 },
  group: { borderWidth: 1, borderColor: c.border },
  groupTitle: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.5, color: c.onSurfaceInverse, backgroundColor: c.surfaceInverse, paddingHorizontal: 12, paddingVertical: 6 },
  prodRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.divider },
  prodName: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface },
  prodBar: { fontFamily: fonts.mono, fontSize: 10, color: c.muted, marginTop: 2 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.borderStrong, backgroundColor: c.surface, gap: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 0.5, color: c.muted },
  totalValue: { fontFamily: fonts.monoMedium, fontSize: 20, color: c.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.6)" },
  sheetScroll: { flexGrow: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  scanProd: { fontFamily: fonts.displayMedium, fontSize: 18, color: c.onSurface },
  scanQtyRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
}));
