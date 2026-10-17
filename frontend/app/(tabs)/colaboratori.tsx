import { useCallback, useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Plus, Storefront, CaretRight, X } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, EmptyState, Field, InitialsBlock } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { formatRON, initials } from "@/src/lib/format";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function Colaboratori() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");

  const { data, isLoading, refetch } = useQuery({ queryKey: ["collaborators"], queryFn: () => api<any[]>("/collaborators") });
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const create = useMutation({
    mutationFn: () => api("/collaborators", { method: "POST", body: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaborators"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setModal(false); setName("");
      toast("Colaborator adaugat", "success");
    },
    onError: (e: any) => { toast(e.message || "Eroare", "error"); if (e?.status === 403) router.push("/abonament"); },
  });

  return (
    <View style={s.root}>
      <AppHeader title="Parteneri" subtitle="Colaboratori in consignatie" />
      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={s.listContent}
        renderItem={({ item }) => (
          <Pressable style={s.row} onPress={() => router.push(`/colaborator/${item.id}`)} testID={`collab-row-${item.id}`}>
            <InitialsBlock text={initials(item.name)} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{item.name}</Text>
              <Text style={s.meta}>{item.total_stock} buc stoc · {item.orders_count} comenzi</Text>
              <Text style={[s.debt, item.pending > 0 ? s.debtOn : s.debtOff]}>
                {item.pending > 0 ? `${formatRON(item.pending)} de incasat` : "Fara restante"}
              </Text>
            </View>
            <CaretRight size={18} color={colors.muted} />
          </Pressable>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState title="Niciun colaborator" subtitle="Adauga primul magazin colaborator." icon={<Storefront size={40} color={colors.muted} />} />
          ) : null
        }
      />

      <View style={[s.cta, { paddingBottom: insets.bottom + 10 }]}>
        <Btn title="Adauga colaborator" onPress={() => setModal(true)} icon={<Plus size={18} color={colors.onBrandPrimary} weight="bold" />} testID="add-collab-button" />
      </View>

      <Modal visible={modal} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>COLABORATOR NOU</Text>
                <Pressable onPress={() => setModal(false)} testID="close-modal"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Field label="Nume colaborator" value={name} onChangeText={setName} placeholder="ex. MOD SHOP SRL" autoFocus testID="collab-name-input" />
              <Btn title="Salveaza" onPress={() => name.trim() && create.mutate()} loading={create.isPending} disabled={!name.trim()} testID="save-collab-button" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  listContent: { padding: 16, paddingBottom: 120, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.borderStrong, padding: 14, backgroundColor: c.surface },
  name: { fontFamily: fonts.displayMedium, fontSize: 17, color: c.onSurface },
  meta: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 3 },
  debt: { fontFamily: fonts.monoMedium, fontSize: 12, marginTop: 4 },
  debtOn: { color: c.negative },
  debtOff: { color: c.muted },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.borderStrong },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.6)" },
  sheetScroll: { flexGrow: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 16 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
}));
