import { useCallback, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { X, FilePdf, CaretRight, UserPlus, PencilSimple, MagnifyingGlass, Warning, Plus, Trash, Key } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, Field, StatusBadge } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { useAuth } from "@/src/context/auth";
import { api } from "@/src/api/client";
import { formatRON, formatDate } from "@/src/lib/format";
import { exportCollaboratorPdf } from "@/src/lib/pdf";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function ColaboratorSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { role } = useAuth();
  const [tab, setTab] = useState<"Stoc" | "Intrari" | "Clienti">("Stoc");

  const [stockModal, setStockModal] = useState<{ pid: string; label: string; qty: string } | null>(null);
  const [delProduct, setDelProduct] = useState<{ id: string; label: string } | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [clientModal, setClientModal] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  const { data, refetch, isLoading } = useQuery({ queryKey: ["collaborator", id], queryFn: () => api<any>(`/collaborators/${id}`), enabled: !!id });
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => api<any>("/settings") });
  const threshold = settingsQ.data?.low_stock_threshold ?? 5;
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    const list = data?.clients ?? [];
    if (!q) return list;
    return list.filter((c: any) => c.name.toLowerCase().includes(q) || (c.phone || "").includes(q));
  }, [data, clientSearch]);

  const saveStock = useMutation({
    mutationFn: () => api(`/collaborators/${id}/stock`, { method: "PUT", body: { product_id: stockModal!.pid, quantity: parseInt(stockModal!.qty || "0", 10) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborator", id] });
      qc.invalidateQueries({ queryKey: ["collaborators"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setStockModal(null);
      toast("Stoc actualizat", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const addClient = useMutation({
    mutationFn: () => api(`/collaborators/${id}/clients`, { method: "POST", body: { name: clientName, phone: clientPhone } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborator", id] });
      setClientModal(false); setClientName(""); setClientPhone("");
      toast("Client adaugat", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const removeProduct = useMutation({
    mutationFn: () => api(`/products/${delProduct!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborator", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDelProduct(null);
      toast("Produs sters din catalog", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const exportPdf = async () => {
    try { await exportCollaboratorPdf(data); } catch { toast("Export esuat", "error"); }
  };

  const genInvite = useMutation({
    mutationFn: () => api<any>("/auth/invites", { method: "POST", body: { collaborator_id: id } }),
    onSuccess: (r: any) => setInviteCode(r.invite_code),
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  return (
    <View style={s.root}>
      <AppHeader
        title={data?.name ?? "Colaborator"}
        subtitle={data ? `${data.total_stock} buc · ${formatRON(data.pending)} de incasat` : undefined}
        onBack={() => router.back()}
        right={
          <>
            {role === "parent" ? (
              <>
                <Pressable onPress={() => genInvite.mutate()} style={s.pdfBtn} testID="gen-invite" disabled={!data || genInvite.isPending}>
                  <Key size={20} color={colors.brandPrimary} weight="bold" />
                </Pressable>
                <Pressable onPress={() => router.push(`/consignatie?collabId=${id}`)} style={s.pdfBtn} testID="add-consignment" disabled={!data}>
                  <Plus size={20} color={colors.onSurface} weight="bold" />
                </Pressable>
              </>
            ) : null}
            <Pressable onPress={exportPdf} style={s.pdfBtn} testID="export-collab-pdf" disabled={!data}>
              <FilePdf size={20} color={colors.onSurface} />
            </Pressable>
          </>
        }
      />

      {/* Totals */}
      {data ? (
        <View style={s.totals}>
          <Totle label="INCASAT" value={formatRON(data.collected)} />
          <Totle label="DE INCASAT" value={formatRON(data.pending)} emphasis={data.pending > 0} />
          <Totle label="COMENZI" value={String(data.orders_count)} />
        </View>
      ) : null}

      {/* Tabs */}
      <View style={s.tabRow}>
        {(["Stoc", "Intrari", "Clienti"] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.tab, tab === t && s.tabActive]} testID={`tab-${t}`}>
            <Text style={[s.tabText, tab === t && s.tabTextActive]}>{t.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "Stoc" ? (
        <FlatList
          data={data?.stock_rows ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <View style={s.stockRow} testID={`stock-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.stockName}>{item.label}</Text>
                <Text style={s.stockPrice}>intrat {item.intrat} · iesit {item.iesit}</Text>
              </View>
              {item.quantity >= 0 && item.quantity <= threshold ? (
                <Warning size={16} color={colors.onWarning} weight="fill" testID={`low-${item.id}`} />
              ) : null}
              <Text style={[s.stockQty, item.quantity < 0 && s.neg]}>{item.quantity}</Text>
              {role === "parent" ? (
                <>
                  <Pressable style={s.adjBtn} onPress={() => setStockModal({ pid: item.id, label: item.label, qty: String(item.quantity) })} testID={`adjust-${item.id}`}>
                    <PencilSimple size={16} color={colors.onSurface} />
                  </Pressable>
                  <Pressable style={s.adjBtn} onPress={() => setDelProduct({ id: item.id, label: item.label })} testID={`delete-stock-${item.id}`}>
                    <Trash size={16} color={colors.negative} />
                  </Pressable>
                </>
              ) : null}
            </View>
          )}
        />
      ) : tab === "Intrari" ? (
        <FlatList
          data={data?.consignments ?? []}
          keyExtractor={(cn) => cn.id}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => (
            <View style={s.consRow} testID={`cons-${item.id}`}>
              <View style={s.consHead}>
                <Text style={s.consPv}>PV {item.pv_number}</Text>
                <Text style={s.consDate}>{formatDate(item.date)}</Text>
              </View>
              <Text style={s.consItems} numberOfLines={3}>{item.items.map((it: any) => `${it.label} x${it.qty}`).join(", ")}</Text>
              <Text style={s.consTotal}>{item.total_items} buc intrate</Text>
            </View>
          )}
          ListEmptyComponent={!isLoading ? <Text style={s.empty}>Nicio intrare. Apasa + sus pentru foaie de consignatie.</Text> : null}
        />
      ) : (
        <>
          <View style={s.searchWrap}>
            <MagnifyingGlass size={16} color={colors.muted} />
            <TextInput
              value={clientSearch}
              onChangeText={setClientSearch}
              placeholder="Cauta client dupa nume sau telefon"
              placeholderTextColor={colors.muted}
              style={s.searchInput}
              testID="client-search-input"
            />
          </View>
          <FlatList
            data={filteredClients}
            keyExtractor={(c) => c.id}
            contentContainerStyle={[s.listContent, { paddingBottom: 110 }]}
            renderItem={({ item }) => (
              <Pressable style={s.clientRow} onPress={() => router.push(`/client/${item.id}`)} testID={`client-row-${item.id}`}>
                <View style={{ flex: 1 }}>
                  <Text style={s.clientName}>{item.name}</Text>
                  <Text style={s.clientMeta}>{item.orders_count} comenzi · {item.phone || "fara telefon"}</Text>
                </View>
                {item.pending > 0 ? <StatusBadge status="In asteptare" /> : null}
                <CaretRight size={16} color={colors.muted} />
              </Pressable>
            )}
            ListEmptyComponent={!isLoading ? <Text style={s.empty}>Niciun client inca.</Text> : null}
          />
        </>
      )}

      {tab === "Clienti" ? (
        <View style={[s.cta, { paddingBottom: insets.bottom + 10 }]}>
          <Btn title="Adauga client" onPress={() => setClientModal(true)} icon={<UserPlus size={18} color={colors.onBrandPrimary} weight="bold" />} testID="add-client-button" />
        </View>
      ) : null}

      {/* Invite code modal */}
      <Modal visible={!!inviteCode} transparent animationType="fade" onRequestClose={() => setInviteCode(null)}>
        <View style={[s.backdrop, { justifyContent: "center", padding: 24 }]}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>COD INVITATIE</Text>
              <Pressable onPress={() => setInviteCode(null)} testID="close-invite"><X size={20} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={s.confirmText}>Trimite acest cod partenerului. El isi creeaza contul din ecranul de autentificare, apasand „Am invitatie". Codul expira in 7 zile.</Text>
            <View style={s.codeBox}><Text style={s.codeText} testID="invite-code">{inviteCode}</Text></View>
            <Btn title="Gata" onPress={() => setInviteCode(null)} testID="invite-done" />
          </View>
        </View>
      </Modal>

      {/* Stock adjust modal */}
      <Modal visible={!!stockModal} transparent animationType="fade" onRequestClose={() => setStockModal(null)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>AJUSTEAZA STOC</Text>
                <Pressable onPress={() => setStockModal(null)} testID="close-stock-modal"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Text style={s.sheetProd}>{stockModal?.label}</Text>
              <Field label="Cantitate in stoc" value={stockModal?.qty ?? ""} onChangeText={(v) => setStockModal((m) => (m ? { ...m, qty: v.replace(/[^0-9-]/g, "") } : m))} keyboardType="numbers-and-punctuation" placeholder="0" autoFocus testID="stock-qty-input" />
              <Btn title="Salveaza stoc" onPress={() => saveStock.mutate()} loading={saveStock.isPending} testID="save-stock-button" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal visible={!!delProduct} transparent animationType="fade" onRequestClose={() => setDelProduct(null)}>
        <View style={[s.backdrop, { justifyContent: "flex-end" }]}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>STERGE PRODUS</Text>
              <Pressable onPress={() => setDelProduct(null)} testID="close-del-product"><X size={20} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={s.confirmText}>Produsul {delProduct?.label} va fi scos din catalog pentru toti partenerii. Comenzile existente raman neschimbate. Continui?</Text>
            <Btn title="Da, sterge" variant="danger" onPress={() => removeProduct.mutate()} loading={removeProduct.isPending} testID="confirm-del-product" />
            <Btn title="Anuleaza" variant="outline" onPress={() => setDelProduct(null)} />
          </View>
        </View>
      </Modal>

      {/* Add client modal */}
      <Modal visible={clientModal} transparent animationType="fade" onRequestClose={() => setClientModal(false)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>CLIENT NOU</Text>
                <Pressable onPress={() => setClientModal(false)} testID="close-client-modal2"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Field label="Nume client" value={clientName} onChangeText={setClientName} placeholder="ex. Ion Popescu" autoFocus testID="client-name-input2" />
              <Field label="Telefon (optional)" value={clientPhone} onChangeText={setClientPhone} placeholder="07xx xxx xxx" keyboardType="phone-pad" testID="client-phone-input2" />
              <Btn title="Salveaza client" onPress={() => clientName.trim() && addClient.mutate()} loading={addClient.isPending} disabled={!clientName.trim()} testID="save-client-button2" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Totle({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  const s = useStyles();
  return (
    <View style={s.totle}>
      <Text style={s.totleLabel}>{label}</Text>
      <Text style={[s.totleValue, emphasis && s.neg]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  pdfBtn: { width: 36, height: 36, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  totals: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.borderStrong },
  totle: { flex: 1, padding: 12, borderRightWidth: 1, borderRightColor: c.border },
  totleLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5, color: c.muted },
  totleValue: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface, marginTop: 4 },
  neg: { color: c.negative },
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.borderStrong },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center", backgroundColor: c.surface },
  tabActive: { backgroundColor: c.surfaceInverse },
  tabText: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 1, color: c.onSurface },
  tabTextActive: { color: c.onSurfaceInverse },
  listContent: { padding: 16, paddingBottom: 32, gap: 10 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  searchInput: { flex: 1, paddingVertical: 12, fontFamily: fonts.mono, fontSize: 14, color: c.onSurface },
  stockRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, paddingVertical: 10 },
  stockName: { fontFamily: fonts.mono, fontSize: 13, color: c.onSurface },
  stockPrice: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 2 },
  consRow: { borderWidth: 1, borderColor: c.borderStrong, padding: 14, gap: 6, backgroundColor: c.surface },
  consHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  consPv: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  consDate: { fontFamily: fonts.mono, fontSize: 11, color: c.muted },
  consItems: { fontFamily: fonts.mono, fontSize: 12, color: c.onSurfaceSecondary },
  consTotal: { fontFamily: fonts.monoMedium, fontSize: 12, color: c.positive },
  stockQty: { fontFamily: fonts.monoMedium, fontSize: 18, color: c.onSurface, minWidth: 40, textAlign: "right" },
  adjBtn: { width: 36, height: 36, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  clientRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: c.borderStrong, padding: 14, backgroundColor: c.surface },
  clientName: { fontFamily: fonts.displayMedium, fontSize: 16, color: c.onSurface },
  clientMeta: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 2 },
  empty: { fontFamily: fonts.mono, fontSize: 13, color: c.muted, textAlign: "center", paddingVertical: 32 },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.borderStrong },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.6)" },
  sheetScroll: { flexGrow: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  sheetProd: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface },
  confirmText: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface, lineHeight: 20 },
  codeBox: { borderWidth: 2, borderColor: c.brandPrimary, paddingVertical: 18, alignItems: "center", backgroundColor: c.surfaceSecondary },
  codeText: { fontFamily: fonts.monoMedium, fontSize: 28, letterSpacing: 4, color: c.onSurface },
}));
