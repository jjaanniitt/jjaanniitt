import { useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { MagnifyingGlass } from "phosphor-react-native";
import { AppHeader } from "@/src/components/header";
import { Btn, Field } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { api } from "@/src/api/client";
import { makeStyles, fonts, useTheme } from "@/src/theme";

export default function SetariFirma() {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({ queryKey: ["company"], queryFn: () => api<any>("/company") });
  const [f, setF] = useState<any>({ name: "", cui: "", reg_com: "", address: "", iban: "", bank: "", phone: "", email: "", invoice_series: "NODE", vat_payer: true });

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

  const lookup = useMutation({
    mutationFn: () => api<any>(`/lookup/cui?cui=${encodeURIComponent((f.cui || "").trim())}`),
    onSuccess: (d: any) => {
      setF((p: any) => ({
        ...p,
        name: d.name || p.name,
        address: d.address || p.address,
        reg_com: d.reg_com || p.reg_com,
        phone: d.phone || p.phone,
        cui: d.cui || p.cui,
        vat_payer: typeof d.vat_payer === "boolean" ? d.vat_payer : p.vat_payer,
      }));
      toast(`Date preluate (${d.source})`, "success");
    },
    onError: (e: any) => toast(e.message || "Firma negasita", "error"),
  });

  return (
    <View style={s.root}>
      <AppHeader title="Date firma" subtitle="Apar pe facturi" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Text style={s.hint}>Aceste date apar pe toate facturile generate.</Text>
        <Field label="Denumire firma" value={f.name} onChangeText={set("name")} placeholder="ex. Node Distributie SRL" testID="co-name" />
        <Field label="CUI" value={f.cui} onChangeText={set("cui")} placeholder="ex. RO12345678" testID="co-cui" />
        <Btn title="Preia date după CUI" variant="outline" onPress={() => (f.cui || "").trim() ? lookup.mutate() : toast("Introdu CUI-ul", "error")} loading={lookup.isPending} icon={<MagnifyingGlass size={18} color={colors.onSurface} weight="bold" />} testID="lookup-cui" />
        <Field label="Nr. Reg. Comertului" value={f.reg_com} onChangeText={set("reg_com")} placeholder="ex. J40/123/2020" testID="co-regcom" />
        <Field label="Adresa" value={f.address} onChangeText={set("address")} placeholder="Strada, oras, judet" testID="co-address" />
        <Field label="IBAN" value={f.iban} onChangeText={set("iban")} placeholder="RO49..." testID="co-iban" />
        <Field label="Banca" value={f.bank} onChangeText={set("bank")} placeholder="ex. Banca Transilvania" testID="co-bank" />
        <Field label="Telefon" value={f.phone} onChangeText={set("phone")} placeholder="07xx xxx xxx" keyboardType="phone-pad" testID="co-phone" />
        <Field label="Serie factura" value={f.invoice_series} onChangeText={set("invoice_series")} autoCapitalize="characters" placeholder="NODE" testID="co-series" />

        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Firmă plătitoare de TVA</Text>
            <Text style={s.switchHint}>{f.vat_payer ? "Facturile vor avea TVA (19% implicit)" : "Facturile vor fi fără TVA (neplătitor)"}</Text>
          </View>
          <Switch
            value={!!f.vat_payer}
            onValueChange={(v) => setF((p: any) => ({ ...p, vat_payer: v }))}
            testID="vat-payer-switch"
          />
        </View>

        <View style={s.oblioHead}>
          <Text style={s.oblioTitle}>CONECTARE OBLIO</Text>
          {data?.oblio_connected ? <View style={s.badgeOn}><Text style={s.badgeOnText}>CONECTAT</Text></View> : null}
        </View>
        <Text style={s.hint}>Emite facturi direct in contul tau Oblio. Gasesti API secret in Oblio → Setari → Date Cont.</Text>
        <Field label="Email cont Oblio" value={f.oblio_email} onChangeText={set("oblio_email")} autoCapitalize="none" keyboardType="email-address" placeholder="email@firma.ro" testID="oblio-email" />
        <Field label={data?.oblio_connected ? "API secret (lasa gol ca sa pastrezi)" : "API secret Oblio"} value={f.oblio_secret || ""} onChangeText={set("oblio_secret")} autoCapitalize="none" secureTextEntry placeholder="••••••••••" testID="oblio-secret" />
        <Field label="CIF firma in Oblio" value={f.oblio_cif} onChangeText={set("oblio_cif")} placeholder="ex. RO12345678" testID="oblio-cif" />
        <Field label="Serie Oblio (ex. FCT)" value={f.oblio_series} onChangeText={set("oblio_series")} autoCapitalize="characters" placeholder="FCT" testID="oblio-series" />

        <Btn title="Salveaza datele firmei" onPress={() => save.mutate()} loading={save.isPending} testID="save-company" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, gap: 14 },
  hint: { fontFamily: fonts.mono, fontSize: 12, color: c.muted, lineHeight: 18 },
  oblioHead: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, borderTopWidth: 1, borderTopColor: c.borderStrong, paddingTop: 16 },
  oblioTitle: { fontFamily: fonts.monoMedium, fontSize: 13, letterSpacing: 1, color: c.onSurface },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: c.borderStrong, padding: 14, backgroundColor: c.surfaceSecondary },
  switchLabel: { fontFamily: fonts.monoMedium, fontSize: 14, color: c.onSurface },
  switchHint: { fontFamily: fonts.mono, fontSize: 11, color: c.muted, marginTop: 3 },
  badgeOn: { backgroundColor: c.success, paddingHorizontal: 8, paddingVertical: 2 },
  badgeOnText: { fontFamily: fonts.monoMedium, fontSize: 9, letterSpacing: 0.5, color: c.onSuccess },
}));
