import { useCallback } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { Warning, TrendUp } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Card } from "@/src/components/ui";
import { api } from "@/src/api/client";
import { formatRON } from "@/src/lib/format";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function Dashboard() {
  const s = useStyles();
  const { colors } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<any>("/dashboard"),
  });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  return (
    <View style={s.root}>
      <AppHeader title="Panou" subtitle="Evidenta vanzari & stocuri" />
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
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1, borderColor: c.borderStrong },
  kpi: { width: "50%", padding: 14, borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.borderStrong, minHeight: 86, justifyContent: "space-between", backgroundColor: c.surface },
  kpiLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, color: c.muted },
  kpiValue: { fontFamily: fonts.monoMedium, fontSize: 22, color: c.onSurface, marginTop: 8 },
  kpiEmphasis: { color: c.negative },
  skeleton: { width: "50%", height: 86, borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceTertiary },
  alert: { padding: 14, borderColor: c.negative, backgroundColor: c.error },
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
