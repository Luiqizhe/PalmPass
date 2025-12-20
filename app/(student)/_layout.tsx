import { Stack } from "expo-router";

export default function StudentDashboardLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false, // disable swipe-back
      }}
    />
  );
}
