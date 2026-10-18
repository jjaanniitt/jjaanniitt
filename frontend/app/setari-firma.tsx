import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { AppHeader } from "@/src/components/header";
import { Btn, Field } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { makeStyles, fonts } from "@/src/theme";

export default function SetariFirma() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({ queryKey: ["company"], queryFn: () => api<any>("/company") });
  const [f, setF] = useState<any>({ name: "", cui: "", reg_com: "", address: "", iban: "", bank: "", phone: "", email: "", invoice_series: "NODE" });

  useEffect(() => { if (data) setF({ ...f, ...data }); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api("/company", { method: "PUT", body: f }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company"] });
      toast("Date firma salvate", "success");
      router.back();
    },
    onError: (e: any) => toast(e.message || "Eroare", "error"),
  });

  const set = (k: string) => (v: string) => setF((p: any) => ({ ...p, [k]: v }));

  return (
    <View style={s.root}>
      <AppHeader title="Date firma" subtitle="Apar pe facturi" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={s.hint}>Aceste date apar pe toate facturile generate.</Text>
        <Field label="Denumire firma" value={f.name} onChangeText={set("name")} placeholder="ex. Node Distributie SRL" testID="co-name" />
        <Field label="CUI" value={f.cui} onChangeText={set("cui")} placeholder="ex. RO12345678" testID="co-cui" />
        <Field label="Nr. Reg. Comertului" value={f.reg_com} onChangeText={set("reg_com")} placeholder="ex. J40/123/2020" testID="co-regcom" />
        <Field label="Adresa" value={f.address} onChangeText={set("address")} placeholder="Strada, oras, judet" testID="co-address" />
        <Field label="IBAN" value={f.iban} onChangeText={set("iban")} placeholder="RO49..." testID="co-iban" />
        <Field label="Banca" value={f.bank} onChangeText={set("bank")} placeholder="ex. Banca Transilvania" testID="co-bank" />
        <Field label="Telefon" value={f.phone} onChangeText={set("phone")} placeholder="07xx xxx xxx" keyboardType="phone-pad" testID="co-phone" />
        <Field label="Serie factura" value={f.invoice_series} onChangeText={set("invoice_series")} autoCapitalize="characters" placeholder="NODE" testID="co-series" />
        <Btn title="Salveaza datele firmei" onPress={() => save.mutate()} loading={save.isPending} testID="save-company" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, gap: 14 },
  hint: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, lineHeight: 18 },
}));
