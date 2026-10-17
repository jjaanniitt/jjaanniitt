import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { Animated, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { makeStyles, fonts } from "@/src/theme";

type ToastKind = "success" | "error" | "info";
type ToastState = { message: string; kind: ToastKind } | null;

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const s = useStyles();

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, kind });
    Haptics.notificationAsync(
      kind === "error" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success,
    );
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setToast(null));
    }, 2600);
  }, [opacity]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[s.wrap, { opacity, top: insets.top + 8 }]}
        >
          <View style={[s.toast, toast.kind === "error" ? s.err : toast.kind === "success" ? s.ok : s.info]}>
            <Text style={[s.text, toast.kind === "error" ? s.errText : toast.kind === "success" ? s.okText : s.infoText]}>{toast.message}</Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const useStyles = makeStyles((c) => ({
  wrap: { position: "absolute", left: 16, right: 16, zIndex: 9999, alignItems: "center" },
  toast: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, maxWidth: "100%" },
  err: { backgroundColor: c.error, borderColor: c.onError },
  ok: { backgroundColor: c.success, borderColor: c.onSuccess },
  info: { backgroundColor: c.surfaceInverse, borderColor: c.borderStrong },
  text: { fontFamily: fonts.monoMedium, fontSize: 13 },
  errText: { color: c.onError },
  okText: { color: c.onSuccess },
  infoText: { color: c.onSurfaceInverse },
}));
