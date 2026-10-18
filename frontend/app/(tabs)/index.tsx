import { useCallback, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { Warning, TrendUp, Gear, ChartBar, CaretRight, UserCircle, Receipt } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, Card, Field } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { formatRON } from "@/src/lib/format";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function Dashboard() {
  const s = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const [settingsModal, setSettingsModal] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [period, setPeriod] = useState<"today" | "month" | "all">("month");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard", period],
    queryFn: () => api<any>(`/dashboard?period=${period}`),
  });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const billQ = useQuery({ queryKey: ["invoices-summary"], queryFn: () => api<any>("/invoices/summary") });

  const saveThreshold = useMutation({
    mutationFn: () => api("/settings", { method: "PUT", body: { low_stock_threshold: parseInt(threshold || "0", 10) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setSettingsModal(false);
      toast("Prag actualizat", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  return (
    <View style={s.root}>
      <AppHeader
        title="Panou"
        subtitle="Evidenta vanzari & stocuri"
        right={
          <>
            <Pressable onPress={() => router.push("/cont")} style={s.gear} testID="open-account">
              <UserCircle size={20} color={colors.onSurface} />
            </Pressable>
            <Pressable onPress={() => { setThreshold(String(data?.low_stock_threshold ?? 5)); setSettingsModal(true); }} style={s.gear} testID="open-settings">
              <Gear size={20} color={colors.onSurface} />
            </Pressable>
          </>
        }
      />
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.onSurface} />}
      >
        {isLoading || !data ? (
          <View style={s.grid}>
            {[0, 1, 2, 3].map((i) => <View key={i} style={s.skeleton} />)}
          </View>
        ) : (
          <>
            <View style={s.periodRow}>
              {(["today", "month", "all"] as const).map((p) => (
                <Pressable key={p} onPress={() => setPeriod(p)} style={[s.periodChip, period === p && s.periodActive]} testID={`period-${p}`}>
                  <Text style={[s.periodText, period === p && s.periodTextActive]}>{p === "today" ? "AZI" : p === "month" ? "LUNA" : "TOT"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.grid}>
              <Kpi label="DE INCASAT" value={formatRON(data.pending)} emphasis testID="kpi-pending" />
              <Kpi label="INCASAT" value={formatRON(data.collected)} testID="kpi-collected" />
              <Kpi label="COMENZI" value={String(data.orders_count)} testID="kpi-orders" />
              <Kpi label="PRODUSE VANDUTE" value={`${data.total_sold} buc`} testID="kpi-sold" />
              <Kpi label="STOC TOTAL" value={`${data.total_stock} buc`} testID="kpi-stock" />
              <Kpi label="PARTENERI" value={String(data.collaborators_count)} testID="kpi-collab" />
            </View>

            {data.negative_count > 0 ? (
              <Card style={s.alert}>
                <View style={s.alertHead}>
                  <Warning size={18} color={colors.negative} weight="fill" />
                  <Text style={s.alertTitle}>{data.negative_count} PRODUSE CU STOC NEGATIV</Text>
                </View>
                {data.negatives.map((n: any, i: number) => (
                  <View key={i} style={s.alertRow}>
                    <Text style={s.alertLabel} numberOfLines={1}>{n.label}</Text>
                    <Text style={s.alertQty}>{n.quantity}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {data.low_stock_count > 0 ? (
              <Card style={s.lowCard}>
                <View style={s.alertHead}>
                  <Warning size={18} color={colors.onWarning} weight="fill" />
                  <Text style={s.lowTitle}>{data.low_stock_count} PRODUSE CU STOC SCAZUT (≤ {data.low_stock_threshold})</Text>
                </View>
                {data.low_stock.map((n: any, i: number) => (
                  <View key={i} style={s.alertRow}>
                    <Text style={s.lowLabel} numberOfLines={1}>{n.label}</Text>
                    <Text style={s.lowQty}>{n.quantity}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <Pressable style={s.reportBtn} onPress={() => router.push("/rapoarte")} testID="open-reports">
              <ChartBar size={20} color={colors.onSurface} weight="regular" />
              <Text style={s.reportText}>RAPOARTE LUNARE</Text>
              <CaretRight size={18} color={colors.muted} />
            </Pressable>

            {billQ.data ? (
              <Pressable style={s.billCard} onPress={() => router.push("/facturi")} testID="dash-billing">
                <View style={s.billHead}>
                  <Receipt size={18} color={colors.onSurface} weight="fill" />
                  <Text style={s.sectionLabel}>FACTURARE</Text>
                  <CaretRight size={16} color={colors.muted} style={{ marginLeft: "auto" }} />
                </View>
                <View style={s.billRow}>
                  <View style={s.billKpi}><Text style={s.billVal}>{formatRON(billQ.data.billed_total)}</Text><Text style={s.billLabel}>FACTURAT</Text></View>
                  <View style={s.billKpi}><Text style={s.billVal}>{formatRON(billQ.data.outstanding_total)}</Text><Text style={s.billLabel}>DE INCASAT</Text></View>
                  <View style={s.billKpi}><Text style={s.billVal}>{formatRON(billQ.data.vat_month)}</Text><Text style={s.billLabel}>TVA LUNA</Text></View>
                </View>
              </Pressable>
            ) : null}

            {data.by_category && data.by_category.length > 0 ? (
              <>
                <Text style={s.sectionLabel}>VANZARI PE CATEGORII</Text>
                <Card style={{ padding: 14 }}>
                  {data.by_category.map((cat: any, i: number) => {
                    const max = data.by_category[0].value || 1;
                    return (
                      <View key={i} style={s.catRow}>
                        <View style={s.catHead}>
                          <Text style={s.catName} numberOfLines={1}>{cat.category}</Text>
                          <Text style={s.catVal}>{formatRON(cat.value)}</Text>
                        </View>
                        <View style={s.barTrack}>
                          <View style={[s.barFill, { width: `${Math.max(4, (cat.value / max) * 100)}%` }]} />
                        </View>
                      </View>
                    );
                  })}
                </Card>

                <Text style={s.sectionLabel}>TOTALURI PE PRODUS</Text>
                <Card>
                  <View style={s.ptHead}>
                    <Text style={[s.ptCell, s.ptLabel, s.ptHeadText]}>PRODUS</Text>
                    <Text style={[s.ptCell, s.ptNum, s.ptHeadText]}>BUC</Text>
                    <Text style={[s.ptCell, s.ptNum, s.ptHeadText]}>LITRI</Text>
                    <Text style={[s.ptCell, s.ptNum, s.ptHeadText]}>VALOARE</Text>
                  </View>
                  {data.product_totals.map((p: any, i: number) => (
                    <View key={i} style={[s.ptRow, i < data.product_totals.length - 1 && s.rowDivider]}>
                      <Text style={[s.ptCell, s.ptLabel]} numberOfLines={1}>{p.label}</Text>
                      <Text style={[s.ptCell, s.ptNum]}>{p.buc}</Text>
                      <Text style={[s.ptCell, s.ptNum]}>{p.litri}</Text>
                      <Text style={[s.ptCell, s.ptNum]}>{p.value}</Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}

            <Text style={s.sectionLabel}>COMENZI RECENTE</Text>
            <Card>
              {data.recent_orders.length === 0 ? (
                <View style={s.emptyRow}>
                  <TrendUp size={18} color={colors.muted} />
                  <Text style={s.emptyText}>Nicio comanda inregistrata inca</Text>
                </View>
              ) : (
                data.recent_orders.map((o: any, i: number) => (
                  <View key={o.id} style={[s.recentRow, i < data.recent_orders.length - 1 && s.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.recentDoc}>{o.document_no}</Text>
                      <Text style={s.recentClient} numberOfLines={1}>{o.client_name}</Text>
                    </View>
                    <Text style={[s.recentTotal, o.status === "Finalizat" ? s.ok : s.pend]}>{formatRON(o.total)}</Text>
                  </View>
                ))
              )}
            </Card>
          </>
        )}
      </ScrollView>

      <Modal visible={settingsModal} transparent animationType="fade" onRequestClose={() => setSettingsModal(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>PRAG STOC SCAZUT</Text>
            <Text style={s.sheetHint}>Primesti o alerta cand un produs ajunge la sau sub acest numar de bucati.</Text>
            <Field label="Prag (buc)" value={threshold} onChangeText={(v) => setThreshold(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" placeholder="5" testID="threshold-input" />
            <Btn title="Salveaza prag" onPress={() => saveThreshold.mutate()} loading={saveThreshold.isPending} testID="save-threshold-button" />
            <Btn title="Anuleaza" variant="outline" onPress={() => setSettingsModal(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Kpi({ label, value, emphasis, testID }: { label: string; value: string; emphasis?: boolean; testID?: string }) {
  const s = useStyles();
  return (
    <View style={s.kpi} testID={testID}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, emphasis && s.kpiEmphasis]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  periodRow: { flexDirection: "row", borderWidth: 1, borderColor: c.borderStrong },
  periodChip: { flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.borderStrong },
  periodActive: { backgroundColor: c.surfaceInverse },
  periodText: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: c.onSurface },
  periodTextActive: { color: c.onSurfaceInverse },
  catRow: { paddingVertical: 7, gap: 5 },
  catHead: { flexDirection: "row", justifyContent: "space-between" },
  catName: { fontFamily: fonts.mono, fontSize: 12, color: c.onSurface, flex: 1 },
  catVal: { fontFamily: fonts.monoMedium, fontSize: 12, color: c.onSurface },
  barTrack: { height: 8, backgroundColor: c.surfaceTertiary },
  barFill: { height: 8, backgroundColor: c.surfaceInverse },
  ptHead: { flexDirection: "row", backgroundColor: c.surfaceInverse, paddingHorizontal: 10, paddingVertical: 8 },
  ptRow: { flexDirection: "row", paddingHorizontal: 10, paddingVertical: 8 },
  ptCell: { fontFamily: fonts.mono, fontSize: 11 },
  ptLabel: { flex: 1, color: c.onSurface },
  ptNum: { width: 52, textAlign: "right", color: c.onSurface },
  ptHeadText: { color: c.onSurfaceInverse, letterSpacing: 0.5 },
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1, borderColor: c.borderStrong },
  kpi: { width: "50%", padding: 14, borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.borderStrong, minHeight: 86, justifyContent: "space-between", backgroundColor: c.surface },
  kpiLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, color: c.muted },
  kpiValue: { fontFamily: fonts.monoMedium, fontSize: 22, color: c.onSurface, marginTop: 8 },
  kpiEmphasis: { color: c.negative },
  skeleton: { width: "50%", height: 86, borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary },
  alert: { padding: 14, borderColor: c.negative, backgroundColor: c.error },
  lowCard: { padding: 14, borderColor: c.onWarning, backgroundColor: c.warning },
  lowTitle: { fontFamily: fonts.monoMedium, fontSize: 12, color: c.onWarning, letterSpacing: 0.5, flex: 1 },
  lowLabel: { fontFamily: fonts.mono, fontSize: 12, color: c.onWarning, flex: 1 },
  lowQty: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onWarning },
  reportBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: c.borderStrong, padding: 16, backgroundColor: c.surface },
  reportText: { flex: 1, fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 0.5, color: c.onSurface },
  billCard: { borderWidth: 1, borderColor: c.borderStrong, padding: 16, backgroundColor: c.surfaceSecondary, gap: 12 },
  billHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  billRow: { flexDirection: "row", gap: 12 },
  billKpi: { flex: 1 },
  billVal: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
  billLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: c.muted, marginTop: 4 },
  gear: { width: 36, height: 36, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 14 },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  sheetHint: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, lineHeight: 18 },
  alertHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  alertTitle: { fontFamily: fonts.monoMedium, fontSize: 12, color: c.negative, letterSpacing: 0.5, flex: 1 },
  alertRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  alertLabel: { fontFamily: fonts.mono, fontSize: 12, color: c.onError, flex: 1 },
  alertQty: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.negative },
  sectionLabel: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: c.muted },
  recentRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  recentDoc: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurface },
  recentClient: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, marginTop: 2 },
  recentTotal: { fontFamily: fonts.monoMedium, fontSize: 14 },
  ok: { color: c.positive },
  pend: { color: c.onWarning },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 18 },
  emptyText: { fontFamily: fonts.mono, fontSize: 13, color: c.muted },
}));
