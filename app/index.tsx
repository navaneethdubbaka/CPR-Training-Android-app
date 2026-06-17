import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getColors } from '@/constants/colors';
import { useTheme } from '@/contexts/ThemeContext';
import {
  CPR_STEPS, CYCLES_TRAINING, CYCLES_TESTING, POST_SHOCK_CYCLES_TRAINING, POST_SHOCK_CYCLES_TESTING,
  COMPRESSIONS_PER_CYCLE, BREATHS_PER_CYCLE, isAedStep,
} from '@/constants/cpr-protocol';
import { useCPRTraining } from '@/contexts/CPRTrainingContext';
import { StepIndicator } from '@/components/StepIndicator';
import { InstructionPanel } from '@/components/InstructionPanel';
import { CompressionFeedback } from '@/components/CompressionFeedback';
import { BreathFeedback } from '@/components/BreathFeedback';
import  CameraViewComponent  from '@/components/CameraView';
import { AEDPanel } from '@/components/AEDPanel';
import { SensorStatus } from '@/components/SensorStatus';
import { SimulationControls } from '@/components/SimulationControls';
import { CompletionScreen } from '@/components/CompletionScreen';
import { StartScreen } from '@/components/StartScreen';
import { SettingsModal } from '@/components/SettingsModal';
import { EnduranceScreen } from '@/components/EnduranceScreen';
import { StepVideo } from '@/components/StepVideo';
import type { CPRPostureResult } from '@/lib/pose-analysis';
import { FRAMING_HOLD_MS, getPoseCheckModeForStep, isFramingGateReady } from '@/lib/cpr-pose-constants';

const ENABLE_POSE_VOICE_CUES = Platform.OS === 'web';

export default function TrainingScreen() {
  const [showSettings, setShowSettings] = useState(false);
  const [voiceCompleted, setVoiceCompleted] = useState(false);
  const [postureResult, setPostureResult] = useState<CPRPostureResult | null>(null);
  const [framingGateOpen, setFramingGateOpen] = useState(false);
  const framingSinceRef = useRef<number | null>(null);
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;
  const { theme } = useTheme();
  const Colors = getColors(theme);

  const isLandscape = screenWidth > screenHeight;
  const isNarrow = screenWidth < 600;
  const useSideBySide = isLandscape && screenWidth >= 600;

  const {
    mode, setMode,
    currentStepIndex, currentStepId, isTraining, isPaused,
    sensorData, connectionStatus, connectionMode, hardwareOnly, metrics, stepTimer,
    aedShockDelivered, handPlacementVerified, postAedCompressionCount,
    cyclePhase, cycleCompressionCount, cycleBreathCount, completedCycles,
    postShockCyclePhase, postShockCycleCompressionCount, postShockCycleBreathCount, postShockCompletedCycles,
    startTraining, pauseTraining, resumeTraining, resetTraining,
    advanceStep, goToStep, connectArduino, disconnectArduino,
    simulateSensor, deliverShock, verifyHandPlacement, simulateCompression, simulateBreath,
  } = useCPRTraining();

  const currentStep = CPR_STEPS[currentStepIndex];
  const isComplete = currentStepIndex >= CPR_STEPS.length;

  const isTesting = mode === 'testing';
  const isCOLS = mode === 'cols';

  const totalCycles = isTesting ? CYCLES_TESTING : CYCLES_TRAINING;
  const postShockTotalCycles = isTesting ? POST_SHOCK_CYCLES_TESTING : POST_SHOCK_CYCLES_TRAINING;
  const poseCheckMode = getPoseCheckModeForStep(currentStepId);
  const showVisualCamera = !isAedStep(currentStepId);
  const showPoseTracking = showVisualCamera && poseCheckMode !== null;

  const framingMessage = poseCheckMode === 'framing_only'
    ? 'Align your head and shoulders inside the box, then look down at the chest'
    : 'Adjust camera until your head, shoulders, and hands are inside the box';

  useEffect(() => {
    setVoiceCompleted(false);
  }, [currentStepIndex]);

  useEffect(() => {
    framingSinceRef.current = null;
    setFramingGateOpen(false);
  }, [currentStepIndex]);

  useEffect(() => {
    const poseFramingRequired = showPoseTracking && Platform.OS === 'web';
    if (!poseFramingRequired || isAedStep(currentStepId)) {
      setFramingGateOpen(true);
      framingSinceRef.current = null;
      return;
    }

    const gateReady = postureResult && poseCheckMode
      ? isFramingGateReady(postureResult, poseCheckMode)
      : false;

    if (!gateReady) {
      framingSinceRef.current = null;
      setFramingGateOpen(false);
      return;
    }

    if (framingGateOpen) return;

    if (framingSinceRef.current === null) {
      framingSinceRef.current = Date.now();
    }

    const elapsed = Date.now() - framingSinceRef.current;
    if (elapsed >= FRAMING_HOLD_MS) {
      setFramingGateOpen(true);
      return;
    }

    const timer = setTimeout(() => {
      if (postureResult && poseCheckMode && isFramingGateReady(postureResult, poseCheckMode)) {
        setFramingGateOpen(true);
      }
    }, FRAMING_HOLD_MS - elapsed);
    return () => clearTimeout(timer);
  }, [postureResult, showPoseTracking, framingGateOpen, poseCheckMode, currentStepId]);


    //Satya Code
  const [shoulderTapDone, setShoulderTapDone] = useState(false);
useEffect(() => {
  if (
    sensorData?.touchSensors?.leftShoulder ||
    sensorData?.touchSensors?.rightShoulder
  ) {
    setShoulderTapDone(true); // ✅ latch
  }
}, [sensorData]);
  
  // End of Satya Code
 // const shoulderTapDone = sensorData.touchSensors.leftShoulder || sensorData.touchSensors.rightShoulder;

  const canAutoAdvance = useMemo(() => {
    if (!currentStep) return false;
    switch (currentStep.id) {
      case 'check_responsiveness':
        return shoulderTapDone && voiceCompleted;
      case 'hand_placement':
        return handPlacementVerified;
      case 'compressions':
        return completedCycles >= totalCycles;
      case 'aed_pads':
        return sensorData.touchSensors.aedPadUpper && sensorData.touchSensors.aedPadLower;
      case 'aed_analyze':
        return stepTimer >= 5;
      case 'aed_shock':
        return aedShockDelivered;
      case 'post_aed_compressions':
        return postShockCompletedCycles >= postShockTotalCycles;
      default:
        return false;
    }
  }, [currentStep, sensorData, stepTimer, handPlacementVerified, completedCycles, totalCycles, aedShockDelivered, postShockCompletedCycles, postShockTotalCycles, shoulderTapDone, voiceCompleted]);

  const stepCanAdvance = useMemo(() => {
    const isCycleStep =
      currentStep?.id === 'compressions' || currentStep?.id === 'post_aed_compressions';
    if (isCycleStep && canAutoAdvance) return true;
    return framingGateOpen && (currentStep?.autoAdvance ? canAutoAdvance : true);
  }, [currentStep, canAutoAdvance, framingGateOpen]);

  useEffect(() => {
    if (stepCanAdvance && currentStep?.autoAdvance && isTraining && !isPaused) {
      const timer = setTimeout(() => advanceStep(), 500);
      return () => clearTimeout(timer);
    }
  }, [stepCanAdvance, currentStep, isTraining, isPaused, advanceStep]);

  const getAutoAdvanceText = useCallback(() => {
    if (!currentStep) return undefined;
    switch (currentStep.id) {
      case 'check_responsiveness':
        return undefined;
      case 'hand_placement':
        return handPlacementVerified ? 'Hands verified' : 'Verifying hand position...';
      case 'compressions': {
        if (completedCycles >= totalCycles) {
          return `All ${totalCycles} cycles complete — finishing…`;
        }
        if (cyclePhase === 'compress') {
          return `Compressions: ${cycleCompressionCount}/${COMPRESSIONS_PER_CYCLE} | Cycles: ${completedCycles}/${totalCycles}`;
        }
        return `Rescue breaths: ${cycleBreathCount}/${BREATHS_PER_CYCLE} | Cycles: ${completedCycles}/${totalCycles}`;
      }
      case 'aed_pads': {
        const upper = sensorData.touchSensors.aedPadUpper ? 'Placed' : 'Waiting';
        const lower = sensorData.touchSensors.aedPadLower ? 'Placed' : 'Waiting';
        return `Upper: ${upper} | Lower: ${lower}`;
      }
      case 'aed_analyze':
        return `Analyzing: ${stepTimer}s / 5s`;
      case 'post_aed_compressions': {
        if (postShockCompletedCycles >= postShockTotalCycles) {
          return `All ${postShockTotalCycles} cycles complete — finishing…`;
        }
        if (postShockCyclePhase === 'compress') {
          return `Compressions: ${postShockCycleCompressionCount}/${COMPRESSIONS_PER_CYCLE} | Cycles: ${postShockCompletedCycles}/${postShockTotalCycles}`;
        }
        return `Rescue breaths: ${postShockCycleBreathCount}/${BREATHS_PER_CYCLE} | Cycles: ${postShockCompletedCycles}/${postShockTotalCycles}`;
      }
      default:
        return undefined;
    }
  }, [currentStep, sensorData, stepTimer, handPlacementVerified, cyclePhase, cycleCompressionCount, cycleBreathCount, completedCycles, totalCycles, postShockCyclePhase, postShockCycleCompressionCount, postShockCycleBreathCount, postShockCompletedCycles, postShockTotalCycles]);

  const showAED = isAedStep(currentStepId);
  const framingBlocked = Platform.OS === 'web' && showPoseTracking && !framingGateOpen;
  const showPostShockCycles = currentStep?.id === 'post_aed_compressions';
  const showCycleTracker = currentStepId === 'compressions' || currentStepId === 'post_aed_compressions';
  const activeCyclePhase = showPostShockCycles ? postShockCyclePhase : cyclePhase;
  const activeCycleCompressionCount = showPostShockCycles ? postShockCycleCompressionCount : cycleCompressionCount;
  const activeCycleBreathCount = showPostShockCycles ? postShockCycleBreathCount : cycleBreathCount;
  const activeCompletedCycles = showPostShockCycles ? postShockCompletedCycles : completedCycles;
  const activeTotalCycles = showPostShockCycles ? postShockTotalCycles : totalCycles;
  const allCyclesComplete = showCycleTracker && activeCompletedCycles >= activeTotalCycles;
  const showCompressions = showCycleTracker && activeCyclePhase === 'compress' && !allCyclesComplete;
  const showBreaths = showCycleTracker && activeCyclePhase === 'breathe' && !allCyclesComplete;

  const styles = makeStyles(Colors);

  if (!isTraining) {
    return (
      <>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <StartScreen
          connectionStatus={connectionStatus}
          onConnect={connectArduino}
          onStart={async () => {
            if (connectionStatus !== 'connected') {
              const ok = await connectArduino();
              if (ok || !hardwareOnly) {
                startTraining();
              }
            } else {
              startTraining();
            }
          }}
          onOpenSettings={() => setShowSettings(true)}
          selectedMode={mode}
          onSelectMode={setMode}
        />
        <SettingsModal
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          connectionStatus={connectionStatus}
          onConnect={connectArduino}
          onDisconnect={disconnectArduino}
        />
      </>
    );
  }

  if (isTraining && isCOLS) {
    return (
      <>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <EnduranceScreen
          compressionCount={metrics.compressions.count}
          goodCompressions={metrics.compressions.goodCompressions}
          totalCompressions={metrics.compressions.totalCompressions}
          currentRate={metrics.compressions.currentRate}
          currentDepth={metrics.compressions.currentDepth}
          elapsedTime={metrics.elapsedTime}
          rateHistory={metrics.compressions.rateHistory}
          depthHistory={metrics.compressions.depthHistory}
          isPaused={isPaused}
          hardwareOnly={hardwareOnly}
          onSimulateCompression={simulateCompression}
          onPause={pauseTraining}
          onResume={resumeTraining}
          onStop={resetTraining}
        />
      </>
    );
  }

  if (isComplete && !isCOLS) {
    return (
      <>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <CompletionScreen
          overallScore={metrics.overallScore}
          sessionAnalytics={metrics.sessionAnalytics}
          elapsedTime={metrics.elapsedTime}
          totalCompressions={metrics.compressions.totalCompressions}
          totalBreaths={metrics.breaths.totalBreaths}
          trainingMode={isTesting ? 'testing' : 'training'}
          coachingEvents={metrics.coachingEvents}
          snapshots={metrics.snapshots}
          onRestart={resetTraining}
        />
      </>
    );
  }

  const cameraOverlayText = currentStep?.id === 'hand_placement'
    ? 'Position hands at center of chest'
    : currentStep?.id === 'compressions'
    ? 'Monitoring compression technique'
    : showPoseTracking
    ? 'Live pose tracking'
    : '';

  const renderVisualPanel = () => (
    <View style={[useSideBySide ? styles.panel : styles.stackedPanel]}>
      {showVisualCamera && (
        <View style={styles.cameraContainer}>
          <CameraViewComponent
            showOverlay={!!cameraOverlayText}
            overlayText={cameraOverlayText}
            onHandDetected={currentStep?.id === 'hand_placement' ? verifyHandPlacement : undefined}
            onPostureResult={setPostureResult}
            enableHandTracking={showPoseTracking}
            isPaused={isPaused}
            poseCheckMode={poseCheckMode ?? 'full_cpr'}
            currentStepId={currentStepId}
          />
        </View>
      )}

      {showAED && (
        <AEDPanel
          upperPadPlaced={sensorData.touchSensors.aedPadUpper}
          lowerPadPlaced={sensorData.touchSensors.aedPadLower}
          analyzing={currentStep?.id === 'aed_analyze'}
          shockAdvised={currentStep?.id === 'aed_shock'}
          onShockPress={deliverShock}
          shockDelivered={aedShockDelivered}
          onShockComplete={advanceStep}
        />
      )}

      {!hardwareOnly && !allCyclesComplete && (
        <SimulationControls
          currentStepId={currentStepId}
          cyclePhase={activeCyclePhase}
          onSimulateSensor={simulateSensor}
          onSimulateCompression={simulateCompression}
          onSimulateBreath={simulateBreath}
          onVerifyHands={verifyHandPlacement}
          sensorState={sensorData.touchSensors}
        />
      )}

      {hardwareOnly && connectionStatus !== 'connected' && (
        <View style={styles.hardwareMessage}>
          <MaterialCommunityIcons name="usb-flash-drive-outline" size={20} color={Colors.warning} />
          <Text style={styles.hardwareMessageText}>Connect Arduino hardware to receive sensor data</Text>
        </View>
      )}
    </View>
  );

  const renderInfoPanel = () => (
    <View style={[useSideBySide ? styles.panel : styles.stackedPanel]}>
      {currentStep && (
        <StepVideo stepId={currentStep.id} stepTitle={currentStep.title} />
      )}
      <InstructionPanel
        stepIndex={currentStepIndex}
        stepTimer={stepTimer}
        onAdvance={advanceStep}
        canAdvance={stepCanAdvance}
        framingBlocked={framingBlocked}
        framingMessage={framingMessage}
        autoAdvanceText={getAutoAdvanceText()}
        hardwareOnly={hardwareOnly}
        hideHints={isTesting}
        voiceCompleted={voiceCompleted}
        onVoiceSuccess={() => setVoiceCompleted(true)}
        shoulderTapDone={shoulderTapDone}
        showCycleTracker={showCycleTracker}
        cyclePhase={activeCyclePhase}
        cycleCompressionCount={activeCycleCompressionCount}
        cycleBreathCount={activeCycleBreathCount}
        completedCycles={activeCompletedCycles}
        totalCycles={activeTotalCycles}
      />

      {showCompressions && (
        <CompressionFeedback
          count={activeCycleCompressionCount}
          currentRate={metrics.compressions.currentRate}
          currentDepth={metrics.compressions.currentDepth}
          currentForce={sensorData.compressionForce}
          avgRate={metrics.compressions.avgRate}
          avgDepth={metrics.compressions.avgDepth}
          goodCount={metrics.compressions.goodCompressions}
          totalCount={metrics.compressions.totalCompressions}
          postureResult={postureResult}
          enablePoseVoiceCues={ENABLE_POSE_VOICE_CUES}
          poseCheckMode={poseCheckMode ?? 'full_cpr'}
          stepId={currentStepId}
          sets={undefined}
          currentSetIndex={undefined}
          setsRequired={activeTotalCycles}
          showSets={false}
          showCycleBadge={showCycleTracker}
          completedCycles={activeCompletedCycles}
          totalCycles={activeTotalCycles}
        />
      )}

      {showBreaths && (
        <BreathFeedback
          count={activeCycleBreathCount}
          currentPressure={metrics.breaths.currentPressure}
          goodBreaths={metrics.breaths.goodBreaths}
          totalBreaths={metrics.breaths.totalBreaths}
          showCycleBadge={showCycleTracker}
          completedCycles={activeCompletedCycles}
          totalCycles={activeTotalCycles}
        />
      )}
    </View>
  );

  if (useSideBySide) {
    return (
      <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset || 8 }]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <View style={styles.topBar}>
          <StepIndicator currentStepIndex={currentStepIndex} onStepPress={goToStep} />
          <SensorStatus
            connectionStatus={connectionStatus}
            connectionMode={connectionMode}
            hardwareOnly={hardwareOnly}
            onConnect={connectArduino}
            onDisconnect={disconnectArduino}
            touchSensors={sensorData.touchSensors}
          />
        </View>
        <View style={styles.mainContentRow}>
          {renderVisualPanel()}
          {renderInfoPanel()}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topInset, paddingBottom: bottomInset || 8 }]}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.topBarPortrait}>
        <StepIndicator currentStepIndex={currentStepIndex} onStepPress={goToStep} />
        <SensorStatus
          connectionStatus={connectionStatus}
          connectionMode={connectionMode}
          hardwareOnly={hardwareOnly}
          onConnect={connectArduino}
          onDisconnect={disconnectArduino}
          touchSensors={sensorData.touchSensors}
        />
      </View>
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        {renderVisualPanel()}
        {renderInfoPanel()}
      </ScrollView>
    </View>
  );
}

function makeStyles(Colors: ReturnType<typeof getColors>) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
      paddingHorizontal: 12,
      gap: 8,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    topBarPortrait: {
      gap: 8,
    },
    mainContentRow: {
      flex: 1,
      flexDirection: 'row',
      gap: 12,
    },
    panel: {
      flex: 1,
      gap: 10,
    },
    stackedPanel: {
      gap: 10,
      marginBottom: 8,
    },
    scrollContent: {
      flex: 1,
    },
    scrollInner: {
      gap: 10,
      paddingBottom: 20,
    },
    cameraContainer: {
      flex: 1,
      minHeight: 180,
    },
    placeholderPanel: {
      flex: 1,
      minHeight: 120,
      backgroundColor: Colors.surface,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    manikinVisual: {
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    placeholderHint: {
      fontSize: 12,
      textAlign: 'center',
      marginTop: 4,
    },
    hardwareMessage: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255, 193, 7, 0.1)',
      borderRadius: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: 'rgba(255, 193, 7, 0.25)',
    },
    hardwareMessageText: {
      fontSize: 13,
      color: Colors.warning,
      fontWeight: '600',
      flex: 1,
    },
  });
}
