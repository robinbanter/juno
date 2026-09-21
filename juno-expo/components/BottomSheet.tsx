import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import styled from "styled-components/native";

import { motion, useReducedMotion } from "../lib/motion";
import { theme } from "../theme";

/**
 * A sheet that comes up from the bottom, and can be thrown back down.
 *
 * ## Why this is not `Modal animationType="slide"`
 *
 * The platform slide is a fixed linear-ish ramp with no backdrop, no grabber
 * and no gesture. It cannot be interrupted, so a finger arriving mid-animation
 * is ignored until the slide finishes — which is the moment someone is most
 * likely to change their mind. Here the same `translateY` drives the opening
 * spring *and* the drag, so a finger can catch the sheet in flight and the
 * spring picks up from wherever it was let go.
 *
 * It is not wrapped in `Modal` either. On iOS a `Modal` is presented in its own
 * `UIWindow`, and the JS responder system inside it never saw the touch moves
 * this drag is built on — the sheet was undraggable and only its buttons
 * worked. Rendered as an overlay in the ordinary view tree, the gesture behaves
 * like every other gesture in the app. What `Modal` was providing instead —
 * covering the tab bar, and the Android back button — is a sibling rendered
 * after `<Tabs>` and a `BackHandler` subscription.
 *
 * ## The motion, and why each number
 *
 * - **Open is a spring, close is a curve.** Opening is physical: a surface
 *   arriving and settling. Closing is the system getting out of the way, so it
 *   is a 230ms ease-out — shorter than the spring that opened it, because a
 *   sheet that takes as long to leave as it took to arrive feels like it is
 *   arguing.
 * - **The backdrop tracks the sheet.** Its opacity is interpolated from the
 *   same value, so dragging halfway down lightens the scrim halfway. Fading it
 *   on a separate timer is the detail that makes a drag feel like it is moving
 *   a real object rather than triggering two animations.
 * - **Up has friction, not a wall.** Dragging above the resting position moves
 *   at 14% of the finger. Nothing in the world stops dead, and an outright
 *   block reads as a bug.
 * - **A flick counts.** Release past 28% of the height *or* faster than
 *   0.55px/ms dismisses. Distance alone punishes the gesture people actually
 *   make, which is short and fast.
 *
 * Everything animated here is `transform` or `opacity` on the native driver,
 * so the drag stays smooth while JS is busy — which, in this app, it often is.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  /** Shown beside the grabber. Omit for a sheet whose content names itself. */
  title,
  /** Set false for a sheet holding work someone could lose, e.g. a filled form. */
  dismissable = true,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  dismissable?: boolean;
}) {
  const reduced = useReducedMotion();
  // Kept separate from `visible` so the closing animation has something to
  // play out against: `visible` goes false first, this follows on settle.
  const [mounted, setMounted] = useState(visible);

  /*
   * Distance below resting position, in points. One value, three jobs: the
   * opening spring, the finger, and the closing curve. Sharing it is what lets
   * a drag interrupt an animation instead of fighting it.
   */
  const y = useRef(new Animated.Value(Dimensions.get("window").height)).current;
  // Measured rather than assumed, so `translateY(height)` hides the sheet
  // exactly whatever it ends up containing.
  const height = useRef(Dimensions.get("window").height);
  const dragging = useRef(false);

  /*
   * How far the keyboard has pushed this sheet up.
   *
   * A sheet anchored to the bottom of the screen is exactly the thing a
   * keyboard covers, and the button someone is reaching for is at its bottom
   * edge. `KeyboardAvoidingView` is the usual answer and is wrong here: it
   * resizes, which fights the drag gesture and the measured height.
   *
   * Adding a second offset to the same transform keeps one source of truth for
   * position — `Animated.add` composes on the native driver, so the sheet can
   * still be dragged while the keyboard is up.
   *
   * `keyboardWillShow` on iOS rather than `didShow`: it fires with the system
   * animation rather than after it, so the sheet travels *with* the keyboard
   * instead of chasing it.
   */
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!mounted) return;
    const willShow = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const willHide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(willShow, (event) => {
      Animated.timing(lift, {
        toValue: -event.endCoordinates.height,
        // Match the system's own curve and duration so the two move as one.
        duration: event.duration || motion.swap,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener(willHide, (event) => {
      Animated.timing(lift, {
        toValue: 0,
        duration: event.duration || motion.swap,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [mounted, lift]);

  const settle = useCallback(() => {
    Animated.spring(y, {
      toValue: 0,
      useNativeDriver: true,
      ...motion.sheetSettle,
    }).start();
  }, [y]);

  const dismiss = useCallback(() => {
    // Otherwise the keyboard is left on screen with nothing above it.
    Keyboard.dismiss();
    Animated.timing(y, {
      toValue: height.current,
      duration: motion.exit,
      easing: motion.easeOut,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    onClose();
  }, [onClose, y]);

  const pan = useRef(
    PanResponder.create({
      // Claim the gesture only once it is clearly a vertical drag. A lower bar
      // would steal taps from the buttons inside the sheet.
      onMoveShouldSetPanResponder: (_event, gesture) =>
        dismissable && Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        dragging.current = true;
      },
      onPanResponderMove: (_event, gesture) => {
        // Down follows the finger exactly; up is resisted rather than refused.
        y.setValue(gesture.dy >= 0 ? gesture.dy : gesture.dy * motion.overdrag);
      },
      onPanResponderRelease: (_event, gesture) => {
        dragging.current = false;
        const far = gesture.dy > height.current * motion.dismissRatio;
        const fast = gesture.vy > motion.dismissVelocity;
        if (far || fast) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          dismiss();
        } else {
          settle();
        }
      },
      // A gesture the system takes away (a call, a notification) must not leave
      // the sheet parked wherever the finger was.
      onPanResponderTerminate: () => {
        dragging.current = false;
        settle();
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    if (mounted) dismiss();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Android's back button closes the sheet rather than the screen under it.
  useEffect(() => {
    if (!mounted || Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (dismissable) onClose();
      return true;
    });
    return () => subscription.remove();
  }, [mounted, dismissable, onClose]);

  const onLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      const measured = event.nativeEvent.layout.height;
      if (measured <= 0 || Math.abs(measured - height.current) < 1) return;
      height.current = measured;
      // Only reposition while the sheet is parked off-screen. Doing it mid-open
      // would snap a sheet whose content just grew — a keyboard appearing, say.
      if (!visible) y.setValue(measured);
    },
    [visible, y],
  );

  useEffect(() => {
    if (!mounted || !visible) return;
    y.setValue(height.current);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (reduced) {
      // Reduced motion keeps the fade and drops the travel: the backdrop still
      // says "something arrived", nothing slides across the screen to say it.
      Animated.timing(y, {
        toValue: 0,
        duration: motion.quick,
        easing: motion.easeOut,
        useNativeDriver: true,
      }).start();
      return;
    }
    Animated.spring(y, {
      toValue: 0,
      useNativeDriver: true,
      ...motion.sheetOpen,
    }).start();
  }, [mounted, visible, reduced, y]);

  if (!mounted) return null;

  /*
   * The scrim, driven by the sheet's own position rather than its own timer.
   * Dragging the sheet a third of the way down lightens the scrim by a third,
   * which is what makes the gesture feel like it is moving one object.
   */
  const scrim = y.interpolate({
    inputRange: [0, Math.max(height.current, 1)],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissable ? onClose : undefined}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>

      <Animated.View
        onLayout={onLayout}
        style={[styles.sheet, { transform: [{ translateY: Animated.add(y, lift) }] }]}
        {...pan.panHandlers}
      >
        <Handle>
          <Grabber />
          {title ? <SheetTitle>{title}</SheetTitle> : null}
        </Handle>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(18, 21, 14, 0.42)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingBottom: 34,
    ...theme.shadow.raised,
  },
});

/**
 * The grab area, which is deliberately taller than the bar it draws.
 *
 * A 4pt target is a 4pt target however good the gesture is. The padding here is
 * the difference between a grabber that looks draggable and one that is.
 */
const Handle = styled.View`
  padding-top: ${(p) => p.theme.space(3)}px;
  padding-bottom: ${(p) => p.theme.space(2)}px;
  align-items: center;
  gap: ${(p) => p.theme.space(2)}px;
`;

const Grabber = styled.View`
  width: 38px;
  height: 5px;
  border-radius: 3px;
  background-color: ${(p) => p.theme.colors.lineStrong};
`;

const SheetTitle = styled.Text`
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: ${(p) => p.theme.colors.faint};
`;
