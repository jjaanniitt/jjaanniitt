import { useEffect, useRef, useState } from "react";
import { Linking, Modal, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { X, Barcode } from "phosphor-react-native";
import { Btn } from "@/src/components/ui";
import { makeStyles, useTheme, fonts } from "@/src/theme";

export function BarcodeScanner({
  visible, onClose, onScanned,
}: {
  visible: boolean; onClose: () => void; onScanned: (code: string) => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [attempted, setAttempted] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    if (visible) lock.current = false;
  }, [visible]);

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain && !attempted) {
      setAttempted(true);
      requestPermission();
    }
  }, [visible, permission, attempted, requestPermission]);

  const handle = ({ data }: { data: string }) => {
    if (lock.current) return;
    lock.current = true;
    onScanned(data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <View style={s.head}>
          <Text style={s.title}>SCANEAZA COD DE BARE</Text>
          <Pressable onPress={onClose} testID="close-scanner"><X size={24} color={colors.onSurfaceInverse} /></Pressable>
        </View>

        {permission?.granted ? (
          <View style={s.cameraWrap}>
            <CameraView
              style={s.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"] }}
              onBarcodeScanned={handle}
            />
            <View style={s.frame} pointerEvents="none" />
            <Text style={s.hint}>Indreapta camera spre codul de bare al produsului</Text>
          </View>
        ) : (
          <View style={s.perm}>
            <Barcode size={48} color={colors.onSurfaceInverse} />
            <Text style={s.permText}>
              {permission && !permission.canAskAgain
                ? "Accesul la camera este blocat. Activeaza-l din setari."
                : "Avem nevoie de acces la camera pentru a scana coduri de bare."}
            </Text>
            {permission && !permission.canAskAgain ? (
              <Btn title="Deschide setari" onPress={() => Linking.openSettings()} testID="open-settings-scanner" />
            ) : (
              <Btn title="Permite camera" onPress={requestPermission} testID="request-camera" />
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontFamily: fonts.monoMedium, fontSize: 14, letterSpacing: 1, color: c.onSurfaceInverse },
  cameraWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  camera: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  frame: { width: 260, height: 160, borderWidth: 2, borderColor: "#FFFFFF" },
  hint: { position: "absolute", bottom: 60, fontFamily: fonts.mono, fontSize: 13, color: "#FFFFFF", paddingHorizontal: 32, textAlign: "center" },
  perm: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, padding: 32 },
  permText: { fontFamily: fonts.mono, fontSize: 14, color: c.onSurfaceInverse, textAlign: "center", lineHeight: 20 },
}));
