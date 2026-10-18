import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Trash, X, PencilSimple, Coins, Receipt } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, Field, StatusBadge } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { formatRON, formatDate } from "@/src/lib/format";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function ComandaDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");

  const { data } = useQuery({ queryKey: ["order", id], queryFn: () => api<any>(`/orders/${id}`), enabled: !!id });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["order", id] });
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["collaborators"] });
    if (data?.collaborator_id) qc.invalidateQueries({ queryKey: ["collaborator", data.collaborator_id] });
    if (data?.client_id) qc.invalidateQueries({ queryKey: ["client", data.client_id] });
  };

  const toggleStatus = useMutation({
    mutationFn: (status: string) => api(`/orders/${id}/status`, { method: "PATCH", body: { status } }),
    onSuccess: () => { invalidateAll(); toast("Status actualizat", "success"); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const pay = useMutation({
    mutationFn: () => api(`/orders/${id}/payments`, { method: "POST", body: { amount: parseFloat(payAmount || "0") } }),
    onSuccess: () => { invalidateAll(); setPayModal(false); setPayAmount(""); toast("Incasare inregistrata", "success"); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const remove = useMutation({
    mutationFn: () => api(`/orders/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidateAll(); setConfirm(false); toast("Comanda stearsa", "success"); router.back(); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const makeInvoice = useMutation({
    mutationFn: () => api<any>("/invoices", { method: "POST", body: { order_id: id, vat_rate: 19 } }),
    onSuccess: (inv: any) => { toast(`Factura ${inv.number_full} generata`, "success"); router.push(`/factura/${inv.id}`); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  if (!data) {
    return (
      <View style={s.root}>
        <AppHeader title="Comanda" onBack={() => router.back()} />
      </View>
    );
  }

  const isFinal = data.status === "Finalizat";
  const paid = data.paid ?? 0;
  const remaining = Math.max(0, data.total - paid);

  const openPay = () => { setPayAmount(String(Math.round(remaining))); setPayModal(true); };

  return (
    <View style={s.root}>
      <AppHeader title={data.document_no} subtitle={formatDate(data.date)} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.headRow}>
          <View>
            <Text style={s.client}>{data.client_name}</Text>
            <Text style={s.collab}>{data.collaborator_name}</Text>
          </View>
          <StatusBadge status={data.status} testID="order-status-badge" />
        </View>

        <Text style={s.section}>PRODUSE</Text>
        <View style={s.table}>
          {data.lines.map((l: any, i: number) => (
            <View key={i} style={[s.lineRow, i < data.lines.length - 1 && s.lineDivider]}>
              <Text style={s.lineName} numberOfLines={1}>{l.label}</Text>
              <Text style={s.lineQty}>{l.qty} × {l.price}</Text>
              <Text style={s.lineSub}>{formatRON(l.subtotal)}</Text>
            </View>
          ))}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL COMANDA</Text>
            <Text style={s.totalValue} testID="order-detail-total">{formatRON(data.total)}</Text>
          </View>
        </View>

        <Text style={s.section}>INCASARE</Text>
        <View style={s.payGrid}>
          <View style={s.payBox}>
            <Text style={s.payLabel}>INCASAT</Text>
            <Text style={[s.payVal, s.ok]} testID="order-paid">{formatRON(paid)}</Text>
          </View>
          <View style={[s.payBox, s.payBoxRight]}>
            <Text style={s.payLabel}>DE INCASAT</Text>
            <Text style={[s.payVal, remaining > 0 && s.rem]} testID="order-remaining">{formatRON(remaining)}</Text>
          </View>
        </View>
        {data.payments && data.payments.length > 0 ? (
          <View style={s.table}>
            {data.payments.map((p: any, i: number) => (
              <View key={i} style={[s.lineRow, i < data.payments.length - 1 && s.lineDivider]}>
                <Text style={s.lineName}>{formatDate(p.date)}</Text>
                <Text style={s.lineSub}>{formatRON(p.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={s.section}>ACTIUNI</Text>
        {remaining > 0 ? (
          <Btn
            title="Incaseaza suma"
            onPress={openPay}
            icon={<Coins size={18} color={colors.onBrandPrimary} weight="bold" />}
            testID="collect-payment-button"
          />
        ) : null}
        <Btn
          title="Genereaza factura"
          onPress={() => makeInvoice.mutate()}
          loading={makeInvoice.isPending}
          icon={<Receipt size={18} color={colors.onBrandPrimary} weight="bold" />}
          testID="make-invoice-button"
        />
        <Btn
          title="Editeaza comanda"
          variant="secondary"
          onPress={() => router.push(`/comanda-noua?editId=${id}`)}
          icon={<PencilSimple size={18} color={colors.onBrandSecondary} weight="bold" />}
          testID="edit-order-button"
        />
        <Btn
          title={isFinal ? "Marcheaza ca neincasat" : "Marcheaza incasat integral"}
          variant={isFinal ? "outline" : "primary"}
          onPress={() => toggleStatus.mutate(isFinal ? "In asteptare" : "Finalizat")}
          loading={toggleStatus.isPending}
          testID="toggle-status-button"
        />
        <Btn title="Sterge comanda" variant="danger" onPress={() => setConfirm(true)} icon={<Trash size={18} color={colors.onBrandPrimary} weight="bold" />} testID="delete-order-button" />
        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>

      <Modal visible={payModal} transparent animationType="fade" onRequestClose={() => setPayModal(false)}>
        <View style={[s.backdrop, { justifyContent: "flex-end" }]}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>INCASARE PARTIALA</Text>
                <Pressable onPress={() => setPayModal(false)} testID="close-pay"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Text style={s.confirmText}>De incasat: {formatRON(remaining)}</Text>
              <Field label="Suma incasata (RON)" value={payAmount} onChangeText={(v) => setPayAmount(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" autoFocus testID="pay-amount-input" />
              <Btn title="Inregistreaza incasarea" onPress={() => pay.mutate()} loading={pay.isPending} disabled={!parseFloat(payAmount || "0")} testID="confirm-payment-button" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>STERGE COMANDA</Text>
              <Pressable onPress={() => setConfirm(false)} testID="close-confirm"><X size={20} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={s.confirmText}>Comanda {data.document_no} va fi stearsa iar stocul va fi returnat. Continui?</Text>
            <Btn title="Da, sterge" variant="danger" onPress={() => remove.mutate()} loading={remove.isPending} testID="confirm-delete-button" />
            <Btn title="Anuleaza" variant="outline" onPress={() => setConfirm(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, gap: 12 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  client: { fontFamily: fonts.displayMedium, fontSize: 22, color: c.onSurface },
  collab: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, marginTop: 2 },
  section: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: c.muted, marginTop: 10 },
  table: { borderWidth: 1, borderColor: c.borderStrong },
  lineRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  lineDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  lineName: { fontFamily: fonts.mono, fontSize: 13, color: c.onSurface, flex: 1 },
  lineQty: { fontFamily: fonts.mono, fontSize: 12, color: c.muted },
  lineSub: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurface, minWidth: 70, textAlign: "right" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12, backgroundColor: c.surfaceInverse },
  totalLabel: { fontFamily: fonts.monoMedium, fontSize: 12, letterSpacing: 0.5, color: c.onSurfaceInverse },
  totalValue: { fontFamily: fonts.monoMedium, fontSize: 18, color: c.onSurfaceInverse },
  payGrid: { flexDirection: "row", borderWidth: 1, borderColor: c.borderStrong },
  payBox: { flex: 1, padding: 14 },
  payBoxRight: { borderLeftWidth: 1, borderLeftColor: c.borderStrong },
  payLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, color: c.muted },
  payVal: { fontFamily: fonts.monoMedium, fontSize: 18, color: c.onSurface, marginTop: 4 },
  ok: { color: c.positive },
  rem: { color: c.negative },
  sheetScroll: { flexGrow: 1, justifyContent: "flex-end" },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 14 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  confirmText: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface, lineHeight: 20 },
}));
