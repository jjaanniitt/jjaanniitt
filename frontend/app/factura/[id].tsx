import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { X, FilePdf, Money, PencilSimple, Trash } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, Field } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { useAuth } from "@/src/context/auth";
import { api } from "@/src/api/client";
import { formatRON, formatRON2, formatDate } from "@/src/lib/format";
import { exportInvoicePdf } from "@/src/lib/pdf";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function FacturaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { role } = useAuth();

  const [payModal, setPayModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [editModal, setEditModal] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [ef, setEf] = useState<any>({ vat_rate: 19, issue_date: "", due_date: "", client_name: "", client_cui: "", client_address: "" });

  const { data, refetch } = useQuery({ queryKey: ["invoice", id], queryFn: () => api<any>(`/invoices/${id}`), enabled: !!id });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const pay = useMutation({
    mutationFn: () => api(`/invoices/${id}/payments`, { method: "POST", body: { amount: parseFloat(amount || "0") } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      setPayModal(false); setAmount("");
      toast("Incasare inregistrata", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const openEdit = () => {
    setEf({
      vat_rate: data.vat_rate, issue_date: data.issue_date, due_date: data.due_date,
      client_name: data.client_name || "", client_cui: data.client_cui || "", client_address: data.client_address || "",
    });
    setEditModal(true);
  };

  const editInv = useMutation({
    mutationFn: () => api(`/invoices/${id}`, { method: "PUT", body: ef }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      setEditModal(false);
      toast("Factura actualizata", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const delInv = useMutation({
    mutationFn: () => api(`/invoices/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices-summary"] });
      setConfirmDel(false);
      toast("Factura stearsa", "success");
      router.back();
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  if (!data) return <View style={s.root}><AppHeader title="Factura" onBack={() => router.back()} /></View>;

  const remaining = data.gross - (data.paid || 0);

  return (
    <View style={s.root}>
      <AppHeader
        title={data.number_full}
        subtitle={`${formatDate(data.issue_date)} · ${data.status}`}
        onBack={() => router.back()}
        right={
          <Pressable onPress={() => exportInvoicePdf(data).catch(() => toast("Export esuat", "error"))} style={s.iconBtn} testID="export-invoice-pdf">
            <FilePdf size={20} color={colors.onSurface} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={s.card}>
          <Text style={s.cardLabel}>CLIENT</Text>
          <Text style={s.cardVal}>{data.client_name}</Text>
          {data.client_cui ? <Text style={s.cardSub}>CUI {data.client_cui}</Text> : null}
          {data.client_address ? <Text style={s.cardSub}>{data.client_address}</Text> : null}
        </View>

        <View style={s.linesBox}>
          {(data.lines || []).map((l: any, i: number) => (
            <View key={i} style={s.lineRow}>
              <Text style={s.lineName}>{l.label} × {l.qty}</Text>
              <Text style={s.lineVal}>{formatRON(l.gross)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals}>
          <View style={s.totRow}><Text style={s.totLabel}>Baza impozabila</Text><Text style={s.totVal}>{formatRON2(data.net)}</Text></View>
          <View style={s.totRow}><Text style={s.totLabel}>TVA {data.vat_rate}%</Text><Text style={s.totVal}>{formatRON2(data.vat)}</Text></View>
          <View style={[s.totRow, s.totFinal]}><Text style={s.totLabelBig}>TOTAL</Text><Text style={s.totValBig}>{formatRON2(data.gross)}</Text></View>
          <View style={s.totRow}><Text style={s.totLabel}>Incasat</Text><Text style={[s.totVal, { color: colors.positive }]}>{formatRON2(data.paid || 0)}</Text></View>
          <View style={s.totRow}><Text style={s.totLabel}>De incasat</Text><Text style={[s.totVal, remaining > 0 && { color: colors.negative }]}>{formatRON2(remaining)}</Text></View>
        </View>

        {(data.payments || []).length > 0 ? (
          <View style={s.card}>
            <Text style={s.cardLabel}>ISTORIC INCASARI</Text>
            {data.payments.map((p: any, i: number) => (
              <View key={i} style={s.payRow}><Text style={s.cardSub}>{formatDate(p.date)}{p.note ? ` · ${p.note}` : ""}</Text><Text style={s.cardVal2}>{formatRON(p.amount)}</Text></View>
            ))}
          </View>
        ) : null}

        {remaining > 0 ? (
          <Btn title="Incaseaza" onPress={() => { setAmount(String(remaining)); setPayModal(true); }} icon={<Money size={18} color={colors.onBrandPrimary} weight="bold" />} testID="collect-invoice" />
        ) : null}
        <Btn title="Descarca PDF" variant="outline" onPress={() => exportInvoicePdf(data).catch(() => toast("Export esuat", "error"))} icon={<FilePdf size={18} color={colors.onSurface} />} testID="download-invoice-pdf" />
        <Btn title="Editeaza factura" variant="secondary" onPress={openEdit} icon={<PencilSimple size={18} color={colors.onBrandSecondary} weight="bold" />} testID="edit-invoice" />
        <Btn title="Sterge factura" variant="danger" onPress={() => setConfirmDel(true)} icon={<Trash size={18} color={colors.onBrandPrimary} weight="bold" />} testID="delete-invoice" />
      </ScrollView>

      <Modal visible={payModal} transparent animationType="fade" onRequestClose={() => setPayModal(false)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>INCASARE FACTURA</Text>
                <Pressable onPress={() => setPayModal(false)} testID="close-pay"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Text style={s.cardSub}>Rest de incasat: {formatRON(remaining)}</Text>
              <Field label="Suma (RON)" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" testID="pay-amount-input" />
              <Btn title="Confirma incasarea" onPress={() => pay.mutate()} disabled={!parseFloat(amount || "0") || pay.isPending} loading={pay.isPending} testID="confirm-pay" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>EDITEAZA FACTURA</Text>
                <Pressable onPress={() => setEditModal(false)} testID="close-edit"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Text style={s.fieldLabel}>COTA TVA</Text>
              <View style={s.vatRow}>
                {[19, 9, 5, 0].map((r) => (
                  <Pressable key={r} style={[s.vatBtn, ef.vat_rate === r && s.vatBtnOn]} onPress={() => setEf((p: any) => ({ ...p, vat_rate: r }))} testID={`vat-${r}`}>
                    <Text style={[s.vatText, ef.vat_rate === r && s.vatTextOn]}>{r}%</Text>
                  </Pressable>
                ))}
              </View>
              <Field label="Data emiterii (AAAA-LL-ZZ)" value={ef.issue_date} onChangeText={(v) => setEf((p: any) => ({ ...p, issue_date: v }))} testID="edit-issue" />
              <Field label="Scadenta (AAAA-LL-ZZ)" value={ef.due_date} onChangeText={(v) => setEf((p: any) => ({ ...p, due_date: v }))} testID="edit-due" />
              <Field label="Nume client" value={ef.client_name} onChangeText={(v) => setEf((p: any) => ({ ...p, client_name: v }))} testID="edit-client-name" />
              <Field label="CUI client" value={ef.client_cui} onChangeText={(v) => setEf((p: any) => ({ ...p, client_cui: v }))} testID="edit-client-cui" />
              <Field label="Adresa client" value={ef.client_address} onChangeText={(v) => setEf((p: any) => ({ ...p, client_address: v }))} testID="edit-client-address" />
              <Btn title="Salveaza modificarile" onPress={() => editInv.mutate()} loading={editInv.isPending} testID="save-invoice-edit" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal visible={confirmDel} transparent animationType="fade" onRequestClose={() => setConfirmDel(false)}>
        <View style={[s.backdrop, { justifyContent: "center", padding: 24 }]}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>STERGE FACTURA</Text>
            <Text style={s.cardSub}>Sigur stergi factura {data.number_full}? Actiunea nu poate fi anulata.</Text>
            <Btn title="Da, sterge" variant="danger" onPress={() => delInv.mutate()} loading={delInv.isPending} testID="confirm-delete-invoice" />
            <Btn title="Anuleaza" variant="outline" onPress={() => setConfirmDel(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  iconBtn: { width: 36, height: 36, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: c.border, padding: 14, gap: 4, backgroundColor: c.surface },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: c.muted },
  cardVal: { fontFamily: fonts.monoMedium, fontSize: 16, color: c.onSurface },
  cardVal2: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  cardSub: { fontFamily: fonts.mono, fontSize: 12, color: c.muted },
  linesBox: { borderWidth: 1, borderColor: c.border },
  lineRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  lineName: { fontFamily: fonts.mono, fontSize: 13, color: c.onSurface, flex: 1 },
  lineVal: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurface },
  totals: { borderWidth: 1, borderColor: c.borderStrong, padding: 14, gap: 8, backgroundColor: c.surfaceSecondary },
  totRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totFinal: { borderTopWidth: 1, borderTopColor: c.borderStrong, paddingTop: 8, marginTop: 2 },
  totLabel: { fontFamily: fonts.mono, fontSize: 13, color: c.onSurfaceSecondary },
  totVal: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  totLabelBig: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  totValBig: { fontFamily: fonts.displayMedium, fontSize: 22, color: c.onSurface },
  payRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetScroll: { flexGrow: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  fieldLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, color: c.muted },
  vatRow: { flexDirection: "row", gap: 8 },
  vatBtn: { flex: 1, borderWidth: 1, borderColor: c.borderStrong, paddingVertical: 10, alignItems: "center", backgroundColor: c.surface },
  vatBtnOn: { backgroundColor: c.brandPrimary },
  vatText: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurface },
  vatTextOn: { color: c.onBrandPrimary },
}));
