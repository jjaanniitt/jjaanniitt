import { useMemo, useState, useEffect } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { X, Check, UserPlus } from "phosphor-react-native";
import { Btn, Field, Stepper } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { formatRON } from "@/src/lib/format";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function ComandaNoua() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();

  const [collabId, setCollabId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [status, setStatus] = useState<"In asteptare" | "Finalizat">("In asteptare");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [clientModal, setClientModal] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const collabsQ = useQuery({ queryKey: ["collaborators"], queryFn: () => api<any[]>("/collaborators") });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => api<any[]>("/products") });

  useEffect(() => {
    if (!collabId && collabsQ.data && collabsQ.data.length > 0) setCollabId(collabsQ.data[0].id);
  }, [collabsQ.data, collabId]);

  const collabDetailQ = useQuery({
    queryKey: ["collaborator", collabId],
    queryFn: () => api<any>(`/collaborators/${collabId}`),
    enabled: !!collabId,
  });

  const clients = collabDetailQ.data?.clients ?? [];

  const groups = useMemo(() => {
    const map: Record<string, any[]> = {};
    (productsQ.data ?? []).forEach((p) => { (map[p.category] ||= []).push(p); });
    return Object.entries(map);
  }, [productsQ.data]);

  const total = useMemo(
    () => (productsQ.data ?? []).reduce((sum, p) => sum + (qty[p.id] || 0) * p.price, 0),
    [qty, productsQ.data],
  );
  const itemCount = useMemo(() => Object.values(qty).reduce((a, b) => a + b, 0), [qty]);

  const addClient = useMutation({
    mutationFn: () => api(`/collaborators/${collabId}/clients`, { method: "POST", body: { name: clientName, phone: clientPhone } }),
    onSuccess: (c: any) => {
      qc.invalidateQueries({ queryKey: ["collaborator", collabId] });
      setClientId(c.id); setClientModal(false); setClientName(""); setClientPhone("");
      toast("Client adaugat", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const submit = useMutation({
    mutationFn: () => {
      const lines = (productsQ.data ?? [])
        .filter((p) => (qty[p.id] || 0) > 0)
        .map((p) => ({ product_id: p.id, qty: qty[p.id] }));
      return api("/orders", { method: "POST", body: { collaborator_id: collabId, client_id: clientId, lines, status } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["collaborators"] });
      qc.invalidateQueries({ queryKey: ["collaborator", collabId] });
      if (clientId) qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast("Comanda inregistrata", "success");
      router.back();
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const canSubmit = !!collabId && !!clientId && itemCount > 0 && !submit.isPending;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.head}>
        <Text style={s.headTitle}>COMANDA NOUA</Text>
        <Pressable onPress={() => router.back()} testID="close-order"><X size={22} color={colors.onSurface} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Collaborator */}
        <Text style={s.section}>COLABORATOR</Text>
        <View style={s.pickRow}>
          {(collabsQ.data ?? []).map((c) => {
            const active = c.id === collabId;
            return (
              <Pressable key={c.id} onPress={() => { setCollabId(c.id); setClientId(null); }} style={[s.pick, active && s.pickActive]} testID={`pick-collab-${c.id}`}>
                <Text style={[s.pickText, active && s.pickTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Client */}
        <View style={s.sectionRow}>
          <Text style={s.section}>CLIENT</Text>
          <Pressable onPress={() => collabId && setClientModal(true)} style={s.addClient} testID="open-add-client">
            <UserPlus size={14} color={colors.onSurface} />
            <Text style={s.addClientText}>CLIENT NOU</Text>
          </Pressable>
        </View>
        {clients.length === 0 ? (
          <Text style={s.hint}>Niciun client. Adauga unul cu butonul Client nou.</Text>
        ) : (
          <View style={s.pickRow}>
            {clients.map((c: any) => {
              const active = c.id === clientId;
              return (
                <Pressable key={c.id} onPress={() => setClientId(c.id)} style={[s.pick, active && s.pickActive]} testID={`pick-client-${c.id}`}>
                  <Text style={[s.pickText, active && s.pickTextActive]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Products */}
        <Text style={s.section}>PRODUSE</Text>
        {groups.map(([cat, items]) => (
          <View key={cat} style={s.group}>
            <Text style={s.groupTitle}>{cat.toUpperCase()}</Text>
            {items.map((p) => (
              <View key={p.id} style={s.prodRow} testID={`order-product-${p.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={s.prodName}>{p.variant} {p.size}</Text>
                  <Text style={s.prodPrice}>{p.price} RON</Text>
                </View>
                <Stepper value={qty[p.id] || 0} onChange={(v) => setQty((q) => ({ ...q, [p.id]: v }))} testID={`stepper-${p.id}`} />
              </View>
            ))}
          </View>
        ))}

        {/* Status */}
        <Text style={s.section}>STATUS</Text>
        <View style={s.pickRow}>
          {(["In asteptare", "Finalizat"] as const).map((st) => {
            const active = st === status;
            return (
              <Pressable key={st} onPress={() => setStatus(st)} style={[s.pick, active && s.pickActive]} testID={`status-${st.replace(/\s/g, "-")}`}>
                <Text style={[s.pickText, active && s.pickTextActive]}>{st.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 10 }]}>
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>TOTAL · {itemCount} buc</Text>
          <Text style={s.totalValue} testID="order-total">{formatRON(total)}</Text>
        </View>
        <Btn
          title="Inregistreaza comanda"
          onPress={() => submit.mutate()}
          disabled={!canSubmit}
          loading={submit.isPending}
          icon={<Check size={18} color={colors.onBrandPrimary} weight="bold" />}
          testID="submit-order-button"
        />
      </View>

      {/* Add client modal */}
      <Modal visible={clientModal} transparent animationType="fade" onRequestClose={() => setClientModal(false)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>CLIENT NOU</Text>
                <Pressable onPress={() => setClientModal(false)} testID="close-client-modal"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Field label="Nume client" value={clientName} onChangeText={setClientName} placeholder="ex. Ion Popescu" autoFocus testID="client-name-input" />
              <Field label="Telefon (optional)" value={clientPhone} onChangeText={setClientPhone} placeholder="07xx xxx xxx" keyboardType="phone-pad" testID="client-phone-input" />
              <Btn title="Salveaza client" onPress={() => clientName.trim() && addClient.mutate()} loading={addClient.isPending} disabled={!clientName.trim()} testID="save-client-button" />
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
  content: { padding: 16, paddingBottom: 24, gap: 10 },
  section: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: c.muted, marginTop: 8 },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  addClient: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: 10, paddingVertical: 6 },
  addClientText: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 0.5, color: c.onSurface },
  hint: { fontFamily: fonts.mono, fontSize: 12, color: c.muted },
  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pick: { borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surface },
  pickActive: { backgroundColor: c.brandPrimary },
  pickText: { fontFamily: fonts.monoMedium, fontSize: 12, color: c.onSurface },
  pickTextActive: { color: c.onBrandPrimary },
  group: { borderWidth: 1, borderColor: c.border, marginTop: 4 },
  groupTitle: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.5, color: c.onSurfaceInverse, backgroundColor: c.surfaceInverse, paddingHorizontal: 12, paddingVertical: 6 },
  prodRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.divider },
  prodName: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface },
  prodPrice: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 2 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.borderStrong, backgroundColor: c.surface, gap: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 0.5, color: c.muted },
  totalValue: { fontFamily: fonts.monoMedium, fontSize: 22, color: c.onSurface },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.6)" },
  sheetScroll: { flexGrow: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
}));
