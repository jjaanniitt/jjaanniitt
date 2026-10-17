import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import dayjs from "dayjs";
import { CaretDown } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Card, EmptyState } from "@/src/components/ui";
import { api } from "@/src/api/client";
import { formatRON } from "@/src/lib/format";
import { makeStyles, useTheme, fonts } from "@/src/theme";

function monthLabel(m: string) {
  const d = dayjs(`${m}-01`);
  return d.isValid() ? d.format("MMMM YYYY").toUpperCase() : m;
}

export default function Rapoarte() {
  const s = useStyles();
  const { colors } = useTheme();
  const [month, setMonth] = useState<string | undefined>(undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["report", month],
    queryFn: () => api<any>(`/reports/monthly${month ? `?month=${month}` : ""}`),
  });

  const months: string[] = data?.months ?? [];

  return (
    <View style={s.root}>
      <AppHeader title="Rapoarte" subtitle="Vanzari & incasari pe luna" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={s.content}>
        {/* Month selector */}
        {months.length > 0 ? (
          <View style={s.monthRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.monthScroll}>
              {months.map((m) => {
                const active = m === (data?.month);
                return (
                  <Pressable key={m} onPress={() => setMonth(m)} style={[s.monthChip, active && s.monthChipActive]} testID={`month-${m}`}>
                    <Text style={[s.monthText, active && s.monthTextActive]}>{monthLabel(m)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {!isLoading && data && data.totals.orders_count === 0 ? (
          <EmptyState title="Nicio comanda" subtitle="Nu exista comenzi in luna selectata." icon={<CaretDown size={36} color={colors.muted} />} />
        ) : null}

        {data && data.totals.orders_count > 0 ? (
          <>
            {/* Totals */}
            <View style={s.grid}>
              <Kpi label="TOTAL VANZARI" value={formatRON(data.totals.total)} />
              <Kpi label="INCASAT" value={formatRON(data.totals.collected)} />
              <Kpi label="DE INCASAT" value={formatRON(data.totals.pending)} />
              <Kpi label="BUCATI" value={`${data.totals.items} buc`} />
            </View>

            {/* Per collaborator */}
            <Text style={s.section}>PER COLABORATOR</Text>
            <Card>
              {data.per_collaborator.map((c: any, i: number) => (
                <View key={i} style={[s.cRow, i < data.per_collaborator.length - 1 && s.divider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cName} numberOfLines={1}>{c.name}</Text>
                    <Text style={s.cMeta}>{c.orders_count} comenzi · incasat {formatRON(c.collected)}</Text>
                  </View>
                  <Text style={s.cTotal}>{formatRON(c.total)}</Text>
                </View>
              ))}
            </Card>

            {/* Products */}
            <Text style={s.section}>PRODUSE VANDUTE</Text>
            <Card>
              {data.products.map((p: any, i: number) => (
                <View key={i} style={[s.pRow, i < data.products.length - 1 && s.divider]}>
                  <Text style={s.pLabel} numberOfLines={1}>{p.label}</Text>
                  <Text style={s.pQty}>{p.qty} buc</Text>
                  <Text style={s.pVal}>{formatRON(p.value)}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, paddingBottom: 32, gap: 16 },
  monthRow: {},
  monthScroll: { gap: 8 },
  monthChip: { height: 36, paddingHorizontal: 14, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, flexShrink: 0 },
  monthChipActive: { backgroundColor: c.brandPrimary },
  monthText: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.5, color: c.onSurface },
  monthTextActive: { color: c.onBrandPrimary },
  grid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1, borderColor: c.borderStrong },
  kpi: { width: "50%", padding: 14, borderRightWidth: 1, borderBottomWidth: 1, borderColor: c.borderStrong, minHeight: 80, justifyContent: "space-between", backgroundColor: c.surface },
  kpiLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.5, color: c.muted },
  kpiValue: { fontFamily: fonts.monoMedium, fontSize: 20, color: c.onSurface, marginTop: 6 },
  section: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 1, color: c.muted },
  cRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  cName: { fontFamily: fonts.displayMedium, fontSize: 15, color: c.onSurface },
  cMeta: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 2 },
  cTotal: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  pRow: { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  pLabel: { fontFamily: fonts.mono, fontSize: 13, color: c.onSurface, flex: 1 },
  pQty: { fontFamily: fonts.mono, fontSize: 12, color: c.muted },
  pVal: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurface, minWidth: 70, textAlign: "right" },
}));
