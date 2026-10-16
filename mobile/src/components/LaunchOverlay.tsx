import { useEffect, useState } from "react";
import { AccessibilityInfo, Image, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import SIRUS_GLYPH from "../../assets/sirus-glyph.png";
import { useSirus } from "../data/store";
import { useUniwindTheme } from "../lib/useUniwindTheme";

/** Shortest and longest time the orbit runs before the light lands (as the web app's). */
const MIN_MS = 900;
const MAX_MS = 6000;
const LAND_MS = 520;
const OUT_MS = 380;
const RADIUS = 85;

/**
 * The app's opening, the phone web app's "orbit that lands" (MobileLaunch): two rings breathe
 * while a point of light circles; once the computers answer (or after six seconds) the light
 * lands, a flash and the Sirus mark appear, and the overlay fades into Home. Reduce Motion skips it.
 */
export function LaunchOverlay() {
  const theme = useUniwindTheme();
  const ready = useSirus((state) => state.ready && (state.computers.length === 0 || state.computers.some((computer) => !!state.data[computer.id])));
  const [phase, setPhase] = useState<"orbit" | "land" | "out" | "done">("orbit");
  const [started] = useState(() => Date.now());
  const [waited, setWaited] = useState(false);

  const breathe = useSharedValue(1);
  const angle = useSharedValue(0);
  const orbits = useSharedValue(1);
  const lightRadius = useSharedValue(RADIUS);
  const light = useSharedValue(1);
  const flash = useSharedValue(0);
  const glyph = useSharedValue(0);
  const overlay = useSharedValue(1);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => { if (reduced) setPhase("done"); });
    breathe.value = withRepeat(withTiming(0.94, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
    angle.value = withRepeat(withTiming(2 * Math.PI, { duration: 1300, easing: Easing.linear }), -1, false);
    const timer = setTimeout(() => setWaited(true), MAX_MS);
    return () => clearTimeout(timer);
  }, [angle, breathe]);

  useEffect(() => {
    if (phase !== "orbit" || !(ready || waited)) return;
    const timer = setTimeout(() => setPhase("land"), Math.max(0, MIN_MS - (Date.now() - started)));
    return () => clearTimeout(timer);
  }, [phase, ready, waited, started]);

  useEffect(() => {
    if (phase === "land") {
      cancelAnimation(breathe);
      const curve = Easing.bezier(0.5, 0, 0.3, 1);
      orbits.value = withTiming(0, { duration: LAND_MS, easing: curve });
      lightRadius.value = withTiming(0, { duration: 360, easing: curve });
      light.value = withDelay(360, withTiming(0, { duration: 80 }));
      flash.value = withDelay(300, withSequence(withTiming(1, { duration: 160 }), withTiming(0, { duration: 360 })));
      glyph.value = withDelay(300, withTiming(1, { duration: 360, easing: Easing.out(Easing.ease) }));
      const timer = setTimeout(() => setPhase("out"), LAND_MS);
      return () => clearTimeout(timer);
    }
    if (phase === "out") {
      overlay.value = withTiming(0, { duration: OUT_MS, easing: Easing.out(Easing.ease) }, (finished) => { if (finished) runOnJS(setPhase)("done"); });
    }
  }, [phase, breathe, orbits, lightRadius, light, flash, glyph, overlay]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value, transform: [{ scale: 1 + (1 - overlay.value) * 0.06 }] }));
  const outerStyle = useAnimatedStyle(() => ({ opacity: orbits.value, transform: [{ scale: (0.5 + orbits.value * 0.5) * breathe.value }] }));
  const innerStyle = useAnimatedStyle(() => ({ opacity: orbits.value, transform: [{ scale: (0.5 + orbits.value * 0.5) * breathe.value }] }));
  const lightStyle = useAnimatedStyle(() => ({
    opacity: light.value,
    transform: [{ translateX: Math.cos(angle.value) * lightRadius.value }, { translateY: Math.sin(angle.value) * lightRadius.value }, { scale: 1 + (1 - light.value) * 2 }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value, transform: [{ scale: 0.4 + flash.value * 1.1 }] }));
  const glyphStyle = useAnimatedStyle(() => ({ opacity: glyph.value, transform: [{ scale: 0.8 + glyph.value * 0.2 }] }));

  if (phase === "done") return null;
  const ring = theme["--color-foreground"];
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme["--color-screen"], alignItems: "center", justifyContent: "center", zIndex: 100 }, overlayStyle]}>
    <Animated.View style={[styles.center, { width: 240, height: 240, borderRadius: 120, borderWidth: 1, borderColor: ring, opacity: 0.08 }, outerStyle]} />
    <View style={[styles.center, { opacity: 0.16 }]}>
      <Animated.View style={[{ width: 170, height: 170, borderRadius: 85, borderWidth: 1, borderColor: ring }, innerStyle]} />
    </View>
    <Animated.View style={[styles.center, { width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(170, 171, 255, 0.35)" }, flashStyle]} />
    <Animated.View style={[styles.center, { width: 10, height: 10, borderRadius: 5, backgroundColor: "#e0e1ff", shadowColor: "#8b8cff", shadowOpacity: 1, shadowRadius: 9, shadowOffset: { width: 0, height: 0 } }, lightStyle]} />
    <Animated.View style={[styles.center, glyphStyle]}>
      <Image source={SIRUS_GLYPH} style={{ width: 92, height: 92, tintColor: theme["--color-foreground"] }} />
    </Animated.View>
  </Animated.View>;
}

const styles = StyleSheet.create({ center: { position: "absolute" } });
