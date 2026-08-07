import 'react-native-reanimated';
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { CPRTrainingProvider } from "@/contexts/CPRTrainingContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { VoiceListeningProvider } from "@/contexts/VoiceListeningContext";
import { arduinoSerial } from "@/lib/arduino-serial";
import { videoAssignments } from "@/lib/video-assignments";
import { ensureMicPermission } from "@/lib/microphone-permissions";
import { voiceRecognition } from "@/lib/voice-recognition";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    arduinoSerial.loadPreferences()
      .then(() => arduinoSerial.loadOffsets())
      .then(() => arduinoSerial.loadInverts())
      .catch(() => {});
    videoAssignments.load().catch(() => {});
    SplashScreen.hideAsync();
    if (Platform.OS === 'android') {
      PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA).catch((err) => {
        if (__DEV__) console.warn('[layout] camera permission request failed:', err);
      });
      ensureMicPermission().catch((err) => {
        if (__DEV__) console.warn('[layout] microphone permission request failed:', err);
      });
    } else if (Platform.OS === 'ios') {
      ensureMicPermission().catch((err) => {
        if (__DEV__) console.warn('[layout] microphone permission request failed:', err);
      });
    }
    if (Platform.OS !== 'web') {
      voiceRecognition.prewarm().catch((err) => {
        if (__DEV__) console.warn('[layout] voice recognition prewarm failed:', err);
      });
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider>
            <CPRTrainingProvider>
              <VoiceListeningProvider>
                <RootLayoutNav />
              </VoiceListeningProvider>
            </CPRTrainingProvider>
          </ThemeProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
