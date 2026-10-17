import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { Plus, ClipboardText, MagnifyingGlass } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, EmptyState, StatusBadge } from "@/src/components/ui";
import { api } from "@/src/api/client";
import { formatRON, formatDate } from "@/src/lib/format";
import { makeStyles, useTheme, fonts } from "@/src/theme";

const FILTERS = ["Toate", "In asteptare", "Finalizat"] as const;

export default function Comenzi() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Toate");
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["orders", filter],
    queryFn: () => api<any[]>(`/orders${filter === "Toate" ? "" : `?status=${encodeURIComponent(filter)}`}`),
  });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (o) => o.document_no.toLowerCase().includes(q) || o.client_name.toLowerCase().includes(q) || o.collaborator_name.toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <View style={s.root}>
      <AppHeader title="Comenzi" subtitle="Comenzile tuturor partenerilor" />
      <View style={s.searchWrap}>
        <MagnifyingGlass size={16} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cauta dupa document sau client"
          placeholderTextColor={colors.muted}
          style={s.searchInput}
          testID="orders-search-input"
        />
      </View>
      <View style={s.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsContent}>
          {FILTERS.map((f) => {
            const active = f === filter;
            return (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[s.chip, active && s.chipActive]}
                testID={`filter-${f.replace(/\s/g, "-")}`}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{f.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(o) => o.id}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={s.row}
            onPress={() => router.push(`/comanda/${item.id}`)}
            testID={`order-row-${item.document_no}`}
          >
            <View style={s.rowTop}>
              <Text style={s.doc}>{item.document_no}</Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={s.client} numberOfLines={1}>{item.client_name}</Text>
            <View style={s.rowBottom}>
              <Text style={s.meta}>{item.collaborator_name} · {formatDate(item.date)}</Text>
              <Text style={s.total}>{formatRON(item.total)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="Nu exista comenzi"
              subtitle="Apasa 'Adauga comanda' pentru a inregistra prima comanda."
              icon={<ClipboardText size={40} color={colors.muted} />}
            />
          ) : null
        }
      />

      <View style={[s.cta, { paddingBottom: insets.bottom + 10 }]}>
        <Btn
          title="Adauga comanda"
          onPress={() => router.push("/comanda-noua")}
          icon={<Plus size={18} color={colors.onBrandPrimary} weight="bold" />}
          testID="add-order-button"
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  searchInput: { flex: 1, paddingVertical: 12, fontFamily: fonts.mono, fontSize: 14, color: c.onSurface },
  chipsWrap: { height: 56, borderBottomWidth: 1, borderBottomColor: c.border, justifyContent: "center" },
  chipsContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 14, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, flexShrink: 0 },
  chipActive: { backgroundColor: c.brandPrimary },
  chipText: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.5, color: c.onSurface },
  chipTextActive: { color: c.onBrandPrimary },
  listContent: { padding: 16, paddingBottom: 120, gap: 12 },
  row: { borderWidth: 1, borderColor: c.borderStrong, padding: 14, gap: 8, backgroundColor: c.surface },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  doc: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  client: { fontFamily: fonts.displayMedium, fontSize: 16, color: c.onSurface },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  meta: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, flex: 1 },
  total: { fontFamily: fonts.monoMedium, fontSize: 15, color: c.onSurface },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.borderStrong },
}));
