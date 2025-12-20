import { Stack } from "expo-router";

export default function LecturerLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="index"
        options={{ gestureEnabled: false, // Dashboard swipe-back disabled
        animation: "slide_from_left" }}
      />

      <Stack.Screen
        name="seat-monitoring/index"
        options={{ gestureEnabled: true, // Seat-monitoring swipe-back enabled
        animation: "fade" }}
      />

      <Stack.Screen
        name="bathroomlog/index"
        options={{ gestureEnabled: true, // Seat-monitoring swipe-back enabled
        animation: "fade" }}
      />
    </Stack>
  );
}

