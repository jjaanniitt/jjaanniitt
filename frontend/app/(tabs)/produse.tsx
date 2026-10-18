import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Package, Plus, X, Barcode, Trash } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, EmptyState, Field } from "@/src/components/ui";
import { BarcodeScanner } from "@/src/components/barcode-scanner";
import { useToast } from "@/src/components/toast";
import { useAuth } from "@/src/context/auth";
import { api } from "@/src/api/client";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export default function Produse() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { role } = useAuth();
  const [cat, setCat] = useState("Toate");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ category: "", variant: "", size: "", price: "", barcode: "" });
  const [edit, setEdit] = useState<{ id: string; label: string; price: string; barcode: string } | null>(null);
  const [scanner, setScanner] = useState(false);
  const [scanFor, setScanFor] = useState<"add" | "edit" | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ["products"], queryFn: () => api<any[]>("/products") });

  const onScanned = (code: string) => {
    setScanner(false);
    if (scanFor === "edit") setEdit((e) => (e ? { ...e, barcode: code } : e));
    else setForm((f) => ({ ...f, barcode: code }));
    setScanFor(null);
  };

  const saveEdit = useMutation({
    mutationFn: () => api(`/products/${edit!.id}`, { method: "PUT", body: { price: parseInt(edit!.price || "0", 10), barcode: edit!.barcode } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setEdit(null); toast("Produs actualizat", "success"); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const removeProduct = useMutation({
    mutationFn: () => api(`/products/${edit!.id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); setConfirmDel(false); setEdit(null); toast("Produs sters", "success"); },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const create = useMutation({
    mutationFn: () => api("/products", { method: "POST", body: {
      category: form.category, variant: form.variant || form.category, size: form.size, price: parseInt(form.price || "0", 10), barcode: form.barcode || null,
    } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      setModal(false); setForm({ category: "", variant: "", size: "", price: "", barcode: "" });
      toast("Produs adaugat", "success");
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const canSave = form.category.trim() && form.size.trim() && !!parseInt(form.price || "0", 10);

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
          <Pressable style={s.row} testID={`product-${item.id}`} onPress={() => role === "parent" && setEdit({ id: item.id, label: `${item.variant} ${item.size}`, price: String(item.price), barcode: item.barcode || "" })}>
            <View style={s.sizeBox}><Text style={s.sizeText}>{item.size}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{item.variant}</Text>
              <View style={s.catRow}>
                <Text style={s.cat}>{item.category}</Text>
                {item.barcode ? <Barcode size={12} color={colors.muted} /> : null}
              </View>
            </View>
            <Text style={s.price}>{item.price} RON</Text>
          </Pressable>
        )}
        ListEmptyComponent={!isLoading ? <EmptyState title="Niciun produs" icon={<Package size={40} color={colors.muted} />} /> : null}
      />

      <View style={[s.cta, { paddingBottom: insets.bottom + 10 }]}>
        {role === "parent" ? (
          <Btn title="Adauga produs" onPress={() => setModal(true)} icon={<Plus size={18} color={colors.onBrandPrimary} weight="bold" />} testID="add-product-button" />
        ) : null}
      </View>

      <Modal visible={modal && !scanner} transparent animationType="fade" onRequestClose={() => setModal(false)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>PRODUS NOU</Text>
                <Pressable onPress={() => setModal(false)} testID="close-product-modal"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Field label="Categorie" value={form.category} onChangeText={(v) => setForm((f) => ({ ...f, category: v }))} placeholder="ex. Ocean" autoFocus testID="product-category-input" />
              <Field label="Denumire / variant" value={form.variant} onChangeText={(v) => setForm((f) => ({ ...f, variant: v }))} placeholder="ex. Detergent" testID="product-variant-input" />
              <Field label="Gramaj" value={form.size} onChangeText={(v) => setForm((f) => ({ ...f, size: v }))} placeholder="ex. 3L" testID="product-size-input" />
              <Field label="Pret (RON)" value={form.price} onChangeText={(v) => setForm((f) => ({ ...f, price: v.replace(/[^0-9]/g, "") }))} placeholder="ex. 40" keyboardType="number-pad" testID="product-price-input" />
              <Field label="Cod de bare (optional)" value={form.barcode} onChangeText={(v) => setForm((f) => ({ ...f, barcode: v }))} placeholder="scaneaza sau tasteaza" testID="product-barcode-input" />
              <Btn title="Scaneaza cod de bare" variant="secondary" onPress={() => { setScanFor("add"); setScanner(true); }} icon={<Barcode size={18} color={colors.onBrandSecondary} weight="bold" />} testID="scan-add-barcode" />
              <Btn title="Salveaza produs" onPress={() => canSave && create.mutate()} loading={create.isPending} disabled={!canSave} testID="save-product-button" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal visible={!!edit && !scanner} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <View style={s.backdrop}>
          <KeyboardAwareScrollView contentContainerStyle={s.sheetScroll} keyboardShouldPersistTaps="handled" bottomOffset={20}>
            <View style={s.sheet}>
              <View style={s.sheetHead}>
                <Text style={s.sheetTitle}>{edit?.label?.toUpperCase()}</Text>
                <Pressable onPress={() => setEdit(null)} testID="close-edit-product"><X size={20} color={colors.onSurface} /></Pressable>
              </View>
              <Field label="Pret (RON)" value={edit?.price ?? ""} onChangeText={(v) => setEdit((e) => (e ? { ...e, price: v.replace(/[^0-9]/g, "") } : e))} keyboardType="number-pad" testID="edit-price-input" />
              <Field label="Cod de bare" value={edit?.barcode ?? ""} onChangeText={(v) => setEdit((e) => (e ? { ...e, barcode: v } : e))} placeholder="scaneaza sau tasteaza" testID="edit-barcode-input" />
              <Btn title="Scaneaza cod de bare" variant="secondary" onPress={() => { setScanFor("edit"); setScanner(true); }} icon={<Barcode size={18} color={colors.onBrandSecondary} weight="bold" />} testID="scan-product-barcode" />
              <Btn title="Salveaza" onPress={() => saveEdit.mutate()} loading={saveEdit.isPending} testID="save-edit-product" />
              <Btn title="Sterge produs" variant="danger" onPress={() => setConfirmDel(true)} icon={<Trash size={18} color={colors.onBrandPrimary} weight="bold" />} testID="delete-product-button" />
            </View>
          </KeyboardAwareScrollView>
        </View>
      </Modal>

      <Modal visible={confirmDel} transparent animationType="fade" onRequestClose={() => setConfirmDel(false)}>
        <View style={[s.backdrop, { justifyContent: "flex-end" }]}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>STERGE PRODUS</Text>
              <Pressable onPress={() => setConfirmDel(false)} testID="close-confirm-product"><X size={20} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={s.confirmText}>Produsul {edit?.label} va fi scos din catalog. Comenzile existente raman neschimbate. Continui?</Text>
            <Btn title="Da, sterge" variant="danger" onPress={() => removeProduct.mutate()} loading={removeProduct.isPending} testID="confirm-delete-product" />
            <Btn title="Anuleaza" variant="outline" onPress={() => setConfirmDel(false)} />
          </View>
        </View>
      </Modal>

      <BarcodeScanner visible={scanner} onClose={() => { setScanner(false); setScanFor(null); }} onScanned={onScanned} />
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
  listContent: { padding: 16, paddingBottom: 120, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.borderStrong, padding: 12, backgroundColor: c.surface },
  sizeBox: { width: 48, height: 48, backgroundColor: c.surfaceInverse, alignItems: "center", justifyContent: "center" },
  sizeText: { fontFamily: fonts.monoMedium, fontSize: 13, color: c.onSurfaceInverse },
  name: { fontFamily: fonts.displayMedium, fontSize: 16, color: c.onSurface },
  cat: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 2 },
  catRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  price: { fontFamily: fonts.monoMedium, fontSize: 16, color: c.onSurface },
  cta: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.borderStrong },
  backdrop: { flex: 1, backgroundColor: "rgba(17,17,17,0.6)" },
  sheetScroll: { flexGrow: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: c.surface, borderTopWidth: 1, borderColor: c.borderStrong, padding: 20, gap: 14 },
  sheetHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  confirmText: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurface, lineHeight: 20 },
}));
