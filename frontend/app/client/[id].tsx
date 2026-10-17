import { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { FilePdf, ClipboardText, PencilSimple, Trash, X } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, EmptyState, Field, StatusBadge } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { formatRON, formatDate } from "@/src/lib/format";
import { exportClientPdf } from "@/src/lib/pdf";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function ClientSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [editModal, setEditModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const { data, refetch, isLoading } = useQuery({ queryKey: ["client", id], queryFn: () => api<any>(`/clients/${id}`), enabled: !!id });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client", id] });
    if (data?.collaborator_id) qc.invalidateQueries({ queryKey: ["collaborator", data.collaborator_id] });
    qc.invalidateQueries({ queryKey: ["collaborators"] });
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const save = useMutation({
    mutationFn: () => api(`/clients/${id}`, { method: "PUT", body: { name, phone } }),
    onSuccess: () => { invalidate(); setEditModal(false); toast("Client actualizat", "success"); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const remove = useMutation({
    mutationFn: () => api(`/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); setConfirm(false); toast("Client sters", "success"); router.back(); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const openEdit = () => { setName(data?.name || ""); setPhone(data?.phone || ""); setEditModal(true); };

  const exportPdf = async () => {
    try { await exportClientPdf(data); } catch { toast("Export esuat", "error"); }
  };

  return (
    <View style={s.root}>
      <AppHeader
        title={data?.name ?? "Client"}
        subtitle={data?.collaborator_name}
        onBack={() => router.back()}
        right={
          <>
            <Pressable onPress={openEdit} style={s.pdfBtn} testID="edit-client-button" disabled={!data}>
              <PencilSimple size={20} color={colors.onSurface} />
            </Pressable>
            <Pressable onPress={() => setConfirm(true)} style={s.pdfBtn} testID="delete-client-button" disabled={!data}>
              <Trash size={20} color={colors.negative} />
            </Pressable>
            <Pressable onPress={exportPdf} style={s.pdfBtn} testID="export-client-pdf" disabled={!data}>
              <FilePdf size={20} color={colors.onSurface} />
            </Pressable>
          </>
        }
      />

      {data?.phone ? <View style={s.phoneBar}><Text style={s.phoneText}>{data.phone}</Text></View> : null}

      {data ? (
        <View style={s.totals}>
          <Totle label="COMENZI" value={String(data.orders_count)} />
          <Totle label="INCASAT" value={formatRON(data.collected)} />
          <Totle label="DE INCASAT" value={formatRON(data.pending)} emphasis={data.pending > 0} />
        </View>
      ) : null}

      <FlatList
        data={data?.orders ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => router.push(`/comanda/${item.id}`)} testID={`client-order-${item.document_no}`}>
            <View style={s.rowTop}>
              <Text style={s.doc}>{item.document_no}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={s.items} numberOfLines={2}>{item.lines.map((l: any) => `${l.label} x${l.qty}`).join(", ")}</Text>
            <View style={s.rowBottom}>
              <Text style={s.date}>{formatDate(item.date)}</Text>
              <Text style={s.total}>{formatRON(item.total)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={!isLoading ? <EmptyState title="Nicio comanda" subtitle="Acest client nu are comenzi inca." icon={<ClipboardText size={40} color={colors.muted} />} /> : null}
      />

      <Modal visible={editModal} transparent animationType="fade" onRequestClose={() => setEditModal(false)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>EDITEAZA CLIENT</Text>
                <Pressable onPress={() => setEditModal(false)} testID="close-edit-client"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Field label="Nume client" value={name} onChangeText={setName} placeholder="Nume" autoFocus testID="edit-client-name-input" />
              <Field label="Telefon (optional)" value={phone} onChangeText={setPhone} placeholder="07xx xxx xxx" keyboardType="phone-pad" testID="edit-client-phone-input" />
              <Btn title="Salveaza" onPress={() => name.trim() && save.mutate()} loading={save.isPending} disabled={!name.trim()} testID="save-client-edit-button" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={[s.backdrop, { justifyContent: "flex-end" }]}>
          <View style={[s.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>STERGE CLIENT</Text>
              <Pressable onPress={() => setConfirm(false)} testID="close-confirm-client"><X size={20} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={s.confirmText}>Clientul {data?.name} va fi sters din lista. Comenzile raman inregistrate. Continui?</Text>
            <Btn title="Da, sterge" variant="danger" onPress={() => remove.mutate()} loading={remove.isPending} testID="confirm-delete-client" />
            <Btn title="Anuleaza" variant="outline" onPress={() => setConfirm(false)} />
          </View>
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
  phoneBar: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.divider },
  phoneText: { fontFamily: fonts.mono, fontSize: 13, color: c.onSurfaceSecondary },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.6)" },
  sheetScroll: { flexGrow: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 14 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  confirmText: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface, lineHeight: 20 },
  totals: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.borderStrong },
  totle: { flex: 1, padding: 12, borderRightWidth: 1, borderRightColor: c.border },
  totleLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.5, color: c.muted },
  totleValue: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface, marginTop: 4 },
  neg: { color: c.negative },
  listContent: { padding: 16, paddingBottom: 32, gap: 12 },
  row: { borderWidth: 1, borderColor: c.borderStrong, padding: 14, gap: 8, backgroundColor: c.surface },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  doc: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  items: { fontFamily: fonts.mono, fontSize: 12, color: c.onSurfaceSecondary },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { fontFamily: fonts.mono, fontSize: 11, color: c.muted },
  total: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
}));
