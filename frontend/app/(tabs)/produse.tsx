import { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Package } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { EmptyState } from "@/src/components/ui";
import { api } from "@/src/api/client";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function Produse() {
  const s = useStyles();
  const { colors } = useTheme();
  const [cat, setCat] = useState("Toate");

  const { data, isLoading } = useQuery({ queryKey: ["products"], queryFn: () => api<any[]>("/products") });

  const categories = useMemo(() => {
    const set: string[] = [];
    (data ?? []).forEach((p) => { if (!set.includes(p.category)) set.push(p.category); });
    return ["Toate", ...set];
  }, [data]);

  const filtered = useMemo(
    () => (data ?? []).filter((p) => cat === "Toate" || p.category === cat),
    [data, cat],
  );

  return (
    <View style={s.root}>
      <AppHeader title="Produse" subtitle="Catalog & preturi (RON)" />
      <View style={s.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsContent}>
          {categories.map((f) => {
            const active = f === cat;
            return (
              <Pressable key={f} onPress={() => setCat(f)} style={[s.chip, active && s.chipActive]} testID={`cat-${f.replace(/\s/g, "-")}`}>
                <Text style={[s.chipText, active && s.chipTextActive]}>{f.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
          <View style={s.row} testID={`product-${item.id}`}>
            <View style={s.sizeBox}><Text style={s.sizeText}>{item.size}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{item.variant}</Text>
              <Text style={s.cat}>{item.category}</Text>
            </View>
            <Text style={s.price}>{item.price} RON</Text>
          </View>
        )}
        ListEmptyComponent={!isLoading ? <EmptyState title="Niciun produs" icon={<Package size={40} color={colors.muted} />} /> : null}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  chipsWrap: { height: 56, borderBottomWidth: 1, borderBottomColor: c.border, justifyContent: "center" },
  chipsContent: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { height: 36, paddingHorizontal: 14, borderWidth: 1, borderColor: c.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: c.surface, flexShrink: 0 },
  chipActive: { backgroundColor: c.brandPrimary },
  chipText: { fontFamily: fonts.monoMedium, fontSize: 11, letterSpacing: 0.5, color: c.onSurface },
  chipTextActive: { color: c.onBrandPrimary },
  listContent: { padding: 16, paddingBottom: 32, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.borderStrong, padding: 12, backgroundColor: c.surface },
  sizeBox: { width: 48, height: 48, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  sizeText: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurfaceInverse },
  name: { fontFamily: fonts.displayMedium, fontSize: 16, color: c.onSurface },
  cat: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 2 },
  price: { fontFamily: fonts.monoMedium, fontSize: 16, color: c.onSurface },
}));
