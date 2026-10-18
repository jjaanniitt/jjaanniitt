import { useMemo, useState, useEffect } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { X, Check, UserPlus, Barcode } from "phosphor-react-native";
import { Btn, Field, Stepper } from "@/src/components/ui";
import { BarcodeScanner } from "@/src/components/barcode-scanner";
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
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEdit = !!editId;

  const [collabId, setCollabId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [status, setStatus] = useState<"In asteptare" | "Finalizat">("In asteptare");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [clientModal, setClientModal] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [prefilled, setPrefilled] = useState(false);
  const [address, setAddress] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [scanner, setScanner] = useState(false);
  const [scanTarget, setScanTarget] = useState<any | null>(null);
  const [scanQty, setScanQty] = useState("1");

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

  const collabsQ = useQuery({ queryKey: ["collaborators"], queryFn: () => api<any[]>("/collaborators") });
  const productsQ = useQuery({ queryKey: ["products"], queryFn: () => api<any[]>("/products") });
  const orderQ = useQuery({ queryKey: ["order", editId], queryFn: () => api<any>(`/orders/${editId}`), enabled: isEdit });

  useEffect(() => {
    if (isEdit && orderQ.data && !prefilled) {
      setCollabId(orderQ.data.collaborator_id);
      setClientId(orderQ.data.client_id);
      setStatus(orderQ.data.status === "Finalizat" ? "Finalizat" : "In asteptare");
      setAddress(orderQ.data.address || "");
      if (orderQ.data.date) setDate(String(orderQ.data.date).slice(0, 10));
      const q: Record<string, number> = {};
      orderQ.data.lines.forEach((l: any) => { q[l.product_id] = l.qty; });
      setQty(q);
      setPrefilled(true);
    }
  }, [isEdit, orderQ.data, prefilled]);

  useEffect(() => {
    if (!isEdit && !collabId && collabsQ.data && collabsQ.data.length > 0) setCollabId(collabsQ.data[0].id);
  }, [collabsQ.data, collabId, isEdit]);

  const collabDetailQ = useQuery({
    queryKey: ["collaborator", collabId],
    queryFn: () => api<any>(`/collaborators/${collabId}`),
    enabled: !!collabId,
  });

  const clients = useMemo(() => collabDetailQ.data?.clients ?? [], [collabDetailQ.data]);

  const selectedClient = useMemo(() => clients.find((c: any) => c.id === clientId), [clients, clientId]);
  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (q) return clients.filter((c: any) => c.name.toLowerCase().includes(q)).slice(0, 8);
    return [...clients].sort((a: any, b: any) => (b.orders_count || 0) - (a.orders_count || 0)).slice(0, 5);
  }, [clients, clientSearch]);
  const dupClient = useMemo(() => {
    const n = clientName.trim().toLowerCase();
    return n ? clients.find((c: any) => c.name.trim().toLowerCase() === n) : undefined;
  }, [clients, clientName]);

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
      setClientId(c.id); setClientModal(false); setClientName(""); setClientPhone(""); setClientSearch("");
      toast("Client adaugat", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const submit = useMutation({
    mutationFn: () => {
      const lines = (productsQ.data ?? [])
        .filter((p) => (qty[p.id] || 0) > 0)
        .map((p) => ({ product_id: p.id, qty: qty[p.id] }));
      if (isEdit) {
        return api(`/orders/${editId}`, { method: "PUT", body: { client_id: clientId, lines, status, date } });
      }
      return api("/orders", { method: "POST", body: { collaborator_id: collabId, client_id: clientId, lines, status, address, date } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["collaborators"] });
      qc.invalidateQueries({ queryKey: ["collaborator", collabId] });
      if (editId) qc.invalidateQueries({ queryKey: ["order", editId] });
      if (clientId) qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast(isEdit ? "Comanda actualizata" : "Comanda inregistrata", "success");
      router.back();
    },
    onError: (e: any) => { toast(e.message || "Eroare", "error"); if (e?.status === 403) router.push("/abonament"); },
  });

  const canSubmit = !!collabId && !!clientId && itemCount > 0 && !submit.isPending;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.head}>
        <Text style={s.headTitle}>{isEdit ? "EDITEAZA COMANDA" : "COMANDA NOUA"}</Text>
        <Pressable onPress={() => router.back()} testID="close-order"><X size={22} color={colors.onSurface} /></Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Collaborator */}
        <Text style={s.section}>COLABORATOR</Text>
        <View style={s.pickRow}>
          {(collabsQ.data ?? []).map((c) => {
            const active = c.id === collabId;
            return (
              <Pressable
                key={c.id}
                onPress={() => { if (!isEdit) { setCollabId(c.id); setClientId(null); } }}
                style={[s.pick, active && s.pickActive, isEdit && !active && s.pickDisabled]}
                disabled={isEdit}
                testID={`pick-collab-${c.id}`}
              >
                <Text style={[s.pickText, active && s.pickTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Client */}
        <View style={s.sectionRow}>
          <Text style={s.section}>CLIENT</Text>
          <Pressable
            onPress={() => { if (collabId) { setClientName(clientSearch.trim()); setClientModal(true); } }}
            style={s.addClient}
            testID="open-add-client"
          >
            <UserPlus size={14} color={colors.onSurface} />
            <Text style={s.addClientText}>CLIENT NOU</Text>
          </Pressable>
        </View>
        {selectedClient ? (
          <View style={s.selectedClient} testID="selected-client">
            <View style={{ flex: 1 }}>
              <Text style={s.selName}>{selectedClient.name}</Text>
              <Text style={s.selMeta}>
                {selectedClient.orders_count} comenzi{selectedClient.phone ? ` · ${selectedClient.phone}` : ""}
              </Text>
            </View>
            <Pressable onPress={() => { setClientId(null); setClientSearch(""); }} testID="clear-client" hitSlop={8}>
              <X size={18} color={colors.muted} />
            </Pressable>
          </View>
        ) : clients.length === 0 ? (
          <Text style={s.hint}>Niciun client. Adauga unul cu butonul CLIENT NOU.</Text>
        ) : (
          <>
            <Field
              label="Cauta client"
              value={clientSearch}
              onChangeText={setClientSearch}
              placeholder="Scrie numele clientului..."
              testID="client-search-input"
            />
            {!clientSearch.trim() && <Text style={s.topLabel}>CEI MAI UTILIZATI CLIENTI</Text>}
            {filteredClients.length === 0 ? (
              <Text style={s.hint}>Niciun client gasit. Apasa CLIENT NOU pentru a-l adauga.</Text>
            ) : (
              <View style={s.clientList}>
                {filteredClients.map((c: any) => (
                  <Pressable key={c.id} onPress={() => setClientId(c.id)} style={s.clientItem} testID={`pick-client-${c.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.clientItemName}>{c.name}</Text>
                      {c.phone ? <Text style={s.clientItemPhone}>{c.phone}</Text> : null}
                    </View>
                    <Text style={s.clientItemCount}>{c.orders_count} com.</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {/* Date & address */}
        <Field label="Data comenzii" value={date} onChangeText={setDate} placeholder="AAAA-LL-ZZ" testID="order-date-input" />
        <Field label="Adresa (optional)" value={address} onChangeText={setAddress} placeholder="Strada, oras..." testID="order-address-input" />

        {/* Products */}
        <View style={s.sectionRow}>
          <Text style={s.section}>PRODUSE</Text>
          <Pressable onPress={() => setScanner(true)} style={s.addClient} testID="open-scan-order">
            <Barcode size={14} color={colors.onSurface} />
            <Text style={s.addClientText}>SCANEAZA</Text>
          </Pressable>
        </View>
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
          title={isEdit ? "Salveaza modificarile" : "Inregistreaza comanda"}
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
              {dupClient ? (
                <View style={s.dupWarn} testID="dup-warning">
                  <Text style={s.dupText}>Clientul „{dupClient.name}” exista deja.</Text>
                  <Pressable
                    onPress={() => {
                      setClientId(dupClient.id);
                      setClientModal(false); setClientName(""); setClientPhone(""); setClientSearch("");
                    }}
                    testID="select-existing-client"
                  >
                    <Text style={s.dupLink}>Selecteaza clientul existent</Text>
                  </Pressable>
                </View>
              ) : null}
              <Field label="Telefon (optional)" value={clientPhone} onChangeText={setClientPhone} placeholder="07xx xxx xxx" keyboardType="phone-pad" testID="client-phone-input" />
              <Btn title="Salveaza client" onPress={() => clientName.trim() && addClient.mutate()} loading={addClient.isPending} disabled={!clientName.trim() || !!dupClient} testID="save-client-button" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

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
              <Btn title="Adauga in comanda" onPress={confirmScanQty} disabled={!parseInt(scanQty || "0", 10)} testID="confirm-scan-qty" />
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
  topLabel: { fontFamily: fonts.monoMedium, fontSize: 10, letterSpacing: 1, color: c.muted, marginTop: 4 },
  clientList: { borderWidth: 1, borderColor: c.border },
  clientItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.divider },
  clientItemName: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface },
  clientItemPhone: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 2 },
  clientItemCount: { fontFamily: fonts.monoMedium, fontSize: 11, color: c.muted },
  selectedClient: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 2, borderColor: c.brandPrimary, paddingHorizontal: 12, paddingVertical: 12 },
  selName: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
  selMeta: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 2 },
  dupWarn: { borderWidth: 1, borderColor: c.negative, backgroundColor: c.error, padding: 12, gap: 6 },
  dupText: { fontFamily: fonts.mono, fontSize: 13, color: c.onError },
  dupLink: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurface, textDecorationLine: "underline" },
  pickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pick: { borderWidth: 1, borderColor: c.borderStrong, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: c.surface },
  pickActive: { backgroundColor: c.brandPrimary },
  pickDisabled: { opacity: 0.4 },
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
  scanProd: { fontFamily: fonts.displayMedium, fontSize: 18, color: c.onSurface },
  scanQtyRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
}));
