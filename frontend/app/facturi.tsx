import { useCallback } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { Receipt, CaretRight } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { EmptyState } from "@/src/components/ui";
import { api } from "@/src/api/client";
import { formatRON, formatDate } from "@/src/lib/format";
import { makeStyles, useTheme, fonts } from "@/src/theme";

const STATUS: Record<string, { bg: string; fg: string }> = {};

export default function Facturi() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const listQ = useQuery({ queryKey: ["invoices"], queryFn: () => api<any[]>("/invoices") });
  const sumQ = useQuery({ queryKey: ["invoices-summary"], queryFn: () => api<any>("/invoices/summary") });
  useFocusEffect(useCallback(() => { listQ.refetch(); sumQ.refetch(); }, [listQ, sumQ]));

  const statusStyle = (st: string) =>
    st === "Platita" ? { backgroundColor: colors.success, color: colors.onSuccess }
    : st === "Partial" ? { backgroundColor: colors.warning, color: colors.onWarning }
    : { backgroundColor: colors.info, color: colors.onInfo };

  return (
    <View style={s.root}>
      <AppHeader title="Facturi" subtitle="Facturare & TVA" />
      <FlatList
        data={listQ.data ?? []}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]}
        ListHeaderComponent={
          sumQ.data ? (
            <View style={s.kpis}>
              <View style={s.kpi}><Text style={s.kpiVal} testID="inv-billed">{formatRON(sumQ.data.billed_total)}</Text><Text style={s.kpiLabel}>FACTURAT</Text></View>
              <View style={s.kpi}><Text style={s.kpiVal}>{formatRON(sumQ.data.outstanding_total)}</Text><Text style={s.kpiLabel}>DE INCASAT</Text></View>
              <View style={s.kpi}><Text style={s.kpiVal}>{formatRON(sumQ.data.vat_month)}</Text><Text style={s.kpiLabel}>TVA LUNA</Text></View>
            </View>
          ) : null
        }
        renderItem={({ item, index }) => {
          const ss = statusStyle(item.status);
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 40).springify().damping(16)}>
            <Pressable style={s.row} onPress={() => router.push(`/factura/${item.id}`)} testID={`invoice-row-${item.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={s.num}>{item.number_full}</Text>
                <Text style={s.meta}>{item.client_name} · {formatDate(item.issue_date)}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={s.amount}>{formatRON(item.gross)}</Text>
                <View style={[s.badge, { backgroundColor: ss.backgroundColor }]}><Text style={[s.badgeText, { color: ss.color }]}>{item.status.toUpperCase()}</Text></View>
              </View>
              <CaretRight size={16} color={colors.muted} />
            </Pressable>
            </Animated.View>
          );
        }}
        ListEmptyComponent={!listQ.isLoading ? (
          <EmptyState title="Nicio factura" subtitle="Genereaza o factura dintr-o comanda finalizata." icon={<Receipt size={40} color={colors.muted} />} />
        ) : null}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, gap: 10 },
  kpis: { flexDirection: "row", gap: 10, marginBottom: 8 },
  kpi: { flex: 1, borderWidth: 1, borderColor: c.borderStrong, padding: 12, backgroundColor: c.surfaceSecondary },
  kpiVal: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
  kpiLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1, color: c.muted, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.border, padding: 14, backgroundColor: c.surface },
  num: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
  meta: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 3 },
  amount: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 0.5 },
}));
