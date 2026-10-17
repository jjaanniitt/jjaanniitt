import { useCallback } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { FilePdf, ClipboardText } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { EmptyState, StatusBadge } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { formatRON, formatDate } from "@/src/lib/format";
import { exportClientPdf } from "@/src/lib/pdf";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function ClientSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();

  const { data, refetch, isLoading } = useQuery({ queryKey: ["client", id], queryFn: () => api<any>(`/clients/${id}`), enabled: !!id });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

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
          <Pressable onPress={exportPdf} style={s.pdfBtn} testID="export-client-pdf" disabled={!data}>
            <FilePdf size={20} color={colors.onSurface} />
          </Pressable>
        }
      />

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
  listContent: { padding: 16, paddingBottom: 32, gap: 12 },
  row: { borderWidth: 1, borderColor: c.borderStrong, padding: 14, gap: 8, backgroundColor: c.surface },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  doc: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  items: { fontFamily: fonts.mono, fontSize: 12, color: c.onSurfaceSecondary },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  date: { fontFamily: fonts.mono, fontSize: 11, color: c.muted },
  total: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
}));
