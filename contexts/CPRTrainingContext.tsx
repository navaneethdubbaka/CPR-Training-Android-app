

import React, { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect, type ReactNode } from 'react';
import { CPR_STEPS, type CPRStepId, COMPRESSIONS_PER_CYCLE, COMPRESSION_ACCURACY_GATE, BREATHS_PER_CYCLE, CYCLES_TRAINING, CYCLES_TESTING, COMPRESSION_SETS_REQUIRED } from '@/constants/cpr-protocol';
import { arduinoSerial, type SensorData, type ArduinoConnectionStatus, type ArduinoConnectionMode, DEFAULT_SENSOR_DATA } from '@/lib/arduino-serial';
import * as Haptics from 'expo-haptics';

export type TrainingMode = 'training' | 'testing' | 'cols';
export type CyclePhase = 'compress' | 'breathe';

interface CompressionSet {
  count: number;
  goodCount: number;
  complete: boolean;
  passed: boolean;
}

interface CompressionMetrics {
  count: number;
  currentRate: number;
  currentDepth: number;
  avgRate: number;
  avgDepth: number;
  goodCompressions: number;
  totalCompressions: number;
  rateHistory: number[];
  depthHistory: number[];
  sets: CompressionSet[];
  currentSetIndex: number;
}

interface BreathMetrics {
  count: number;
  currentPressure: number;
  goodBreaths: number;
  totalBreaths: number;
}

interface SessionMetrics {
  startTime: number;
  elapsedTime: number;
  cyclesCompleted: number;
  overallScore: number;
  compressions: CompressionMetrics;
  breaths: BreathMetrics;
}

interface CPRTrainingState {
  mode: TrainingMode;
  currentStepIndex: number;
  currentStepId: CPRStepId;
  isTraining: boolean;
  isPaused: boolean;
  sensorData: SensorData;
  connectionStatus: ArduinoConnectionStatus;
  connectionMode: ArduinoConnectionMode;
  hardwareOnly: boolean;
  metrics: SessionMetrics;
  stepTimer: number;
  aedShockDelivered: boolean;
  cameraPermissionGranted: boolean;
  handPlacementVerified: boolean;
  postAedCompressionCount: number;
  cyclePhase: CyclePhase;
  cycleCompressionCount: number;
  cycleBreathCount: number;
  completedCycles: number;
}

interface CPRTrainingContextValue extends CPRTrainingState {
  setMode: (mode: TrainingMode) => void;
  startTraining: () => void;
  pauseTraining: () => void;
  resumeTraining: () => void;
  resetTraining: () => void;
  advanceStep: () => void;
  goToStep: (index: number) => void;
  connectArduino: () => Promise<boolean>;
  disconnectArduino: () => void;
  simulateSensor: (sensor: string, value: boolean) => void;
  simulateNeckTilt: () => void;
  deliverShock: () => void;
  setCameraPermission: (granted: boolean) => void;
  verifyHandPlacement: () => void;
  simulateCompression: () => void;
  simulateBreath: () => void;
}

const defaultCompressionSet: CompressionSet = { count: 0, goodCount: 0, complete: false, passed: false };

const makeDefaultSets = (count: number): CompressionSet[] =>
  Array.from({ length: count }, () => ({ ...defaultCompressionSet }));

const defaultMetrics: SessionMetrics = {
  startTime: 0,
  elapsedTime: 0,
  cyclesCompleted: 0,
  overallScore: 0,
  compressions: {
    count: 0,
    currentRate: 0,
    currentDepth: 0,
    avgRate: 0,
    avgDepth: 0,
    goodCompressions: 0,
    totalCompressions: 0,
    rateHistory: [],
    depthHistory: [],
    sets: makeDefaultSets(COMPRESSION_SETS_REQUIRED),
    currentSetIndex: 0,
  },
  breaths: {
    count: 0,
    currentPressure: 0,
    goodBreaths: 0,
    totalBreaths: 0,
  },
};

const CPRTrainingContext = createContext<CPRTrainingContextValue | null>(null);

export function CPRTrainingProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<TrainingMode>('training');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isTraining, setIsTraining] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [sensorData, setSensorData] = useState<SensorData>(DEFAULT_SENSOR_DATA);
  const [connectionStatus, setConnectionStatus] = useState<ArduinoConnectionStatus>('disconnected');
  const [connectionMode, setConnectionMode] = useState<ArduinoConnectionMode>(arduinoSerial.getMode());
  const [hardwareOnly, setHardwareOnly] = useState(arduinoSerial.getHardwareOnly());
  const [metrics, setMetrics] = useState<SessionMetrics>(defaultMetrics);
  const [stepTimer, setStepTimer] = useState(0);
  const [aedShockDelivered, setAedShockDelivered] = useState(false);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [handPlacementVerified, setHandPlacementVerified] = useState(false);
  const [postAedCompressionCount, setPostAedCompressionCount] = useState(0);
  const [cyclePhase, setCyclePhase] = useState<CyclePhase>('compress');
  const [breathCount, setBreathCount] = useState(0);

  const [cycleCompressionCount, setCycleCompressionCount] = useState(0);
  const [cycleBreathCount, setCycleBreathCount] = useState(0);
  const [completedCycles, setCompletedCycles] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCompressionTime = useRef(0);
  const compressionRates = useRef<number[]>([]);
  const currentStepIdRef = useRef<string>('scene_safety');
  const modeRef = useRef<TrainingMode>('training');
  const isTrainingRef = useRef(false);
  const cyclePhaseRef = useRef<CyclePhase>('compress');
  const cycleCompressionCountRef = useRef(0);
  const cycleBreathCountRef = useRef(0);
  const completedCyclesRef = useRef(0);

  const currentStep = CPR_STEPS[currentStepIndex];
  const currentStepId = (currentStep?.id || 'complete') as CPRStepId;

  useEffect(() => { currentStepIdRef.current = currentStepId; }, [currentStepId]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { isTrainingRef.current = isTraining; }, [isTraining]);

  const resetCycleState = useCallback(() => {
    cyclePhaseRef.current = 'compress';
    cycleCompressionCountRef.current = 0;
    cycleBreathCountRef.current = 0;
    completedCyclesRef.current = 0;
    setCyclePhase('compress');
    setCycleCompressionCount(0);
    setCycleBreathCount(0);
    setCompletedCycles(0);
  }, []);

  useEffect(() => {


    //New Satya
    const unsubData = arduinoSerial.onSensorData((data) => {
      setSensorData(data);

      const stepId = currentStepIdRef.current;
      const currentMode = modeRef.current;
      const isColsMode = currentMode === 'cols';
      const training = isTrainingRef.current;

      // 🟢 ✅ REAL-TIME UPDATE (EVERY FRAME)
      setMetrics(prev => ({
        ...prev,
        compressions: {
          ...prev.compressions,

          currentDepth: data.compressionDepth,
          currentRate: data.compressionRate,

          // keep live graph smooth
          rateHistory: [...prev.compressions.rateHistory.slice(-49), data.compressionRate],
          depthHistory: [...prev.compressions.depthHistory.slice(-49), data.compressionDepth],
        },
      }));

      // 🔵 ✅ EVENT-BASED UPDATE (ONLY ON FULL CYCLE)
      if (data.compressionDetected && training) {

        const now = Date.now();

        if (lastCompressionTime.current > 0) {
          const interval = now - lastCompressionTime.current;
          const rate = 60000 / interval;
          compressionRates.current.push(rate);
        }

        lastCompressionTime.current = now;

        const depth = data.compressionPeak ?? data.compressionDepth;

        const isGoodDepth = depth >= 5 && depth <= 6;
        const isGoodRate = data.compressionRate >= 100 && data.compressionRate <= 120;
        const isGood = isGoodDepth && isGoodRate;

        if (isColsMode) {
          setMetrics(prev => ({
            ...prev,
            compressions: {
              ...prev.compressions,

              count: prev.compressions.count + 1,
              totalCompressions: prev.compressions.totalCompressions + 1,
              goodCompressions: prev.compressions.goodCompressions + (isGood ? 1 : 0),

              avgRate: compressionRates.current.length > 0
                ? compressionRates.current.reduce((a, b) => a + b, 0) / compressionRates.current.length
                : 0,

              avgDepth: prev.compressions.totalCompressions > 0
                ? (prev.compressions.avgDepth * prev.compressions.totalCompressions + depth) / (prev.compressions.totalCompressions + 1)
                : depth,
            },
          }));

        } else if (stepId === 'compressions' && cyclePhaseRef.current === 'compress') {

          if (cycleCompressionCountRef.current >= COMPRESSIONS_PER_CYCLE) {
            return; // 🚫 STOP HARD
          }

          const newCount = cycleCompressionCountRef.current + 1;

          // if (newCount >= COMPRESSIONS_PER_CYCLE) {
          //   cycleCompressionCountRef.current = 0;
          //   cyclePhaseRef.current = 'breathe';
          //  // setCycleCompressionCount(0);
          //   setCyclePhase('breathe');
          // } else {
          //   cycleCompressionCountRef.current = newCount;
          //   setCycleCompressionCount(newCount);
          // }

          if (data.phase === 'BREATH') {
            setCyclePhase('breathe');
          } else {
            setCyclePhase('compress');
          }

          setMetrics(prev => ({
            ...prev,
            compressions: {
              ...prev.compressions,

              count: prev.compressions.count + 1,
              totalCompressions: prev.compressions.totalCompressions + 1,
              goodCompressions: prev.compressions.goodCompressions + (isGood ? 1 : 0),

              avgRate: compressionRates.current.length > 0
                ? compressionRates.current.reduce((a, b) => a + b, 0) / compressionRates.current.length
                : 0,

              avgDepth: prev.compressions.totalCompressions > 0
                ? (prev.compressions.avgDepth * prev.compressions.totalCompressions + depth) / (prev.compressions.totalCompressions + 1)
                : depth,
            },
          }));

        } else if (stepId === 'post_aed_compressions') {
          setPostAedCompressionCount(prev => prev + 1);
        }
      }

      // 🟡 BREATH LOGIC (UNCHANGED)
      //if (data.airPressure > 10 && training && stepId === 'compressions' && cyclePhaseRef.current === 'breathe') {
      if (data.breathDetected && training && stepId === 'compressions' && data.phase === 'BREATH') {
        //const isGoodBreath = data.airPressure >= 15 && data.airPressure <= 25;
        const isGoodBreath = data.airPressure >= 0.4 && data.airPressure <= 0.9;
        //const newBreathCount = cycleBreathCountRef.current + 1;
        const newBreathCount = data.breathCount; // Sync breath count directly from Arduino for accuracy

        // if (newBreathCount >= BREATHS_PER_CYCLE) {

        //   const newCycles = completedCyclesRef.current + 1;

        //   // ✅ FULL RESET HERE (correct place)
        //   cycleCompressionCountRef.current = 0;
        //   cycleBreathCountRef.current = 0;

        //  // cyclePhaseRef.current = 'compress';
        //   completedCyclesRef.current = newCycles;

        //   setCycleCompressionCount(0);
        //   setCycleBreathCount(0);
        //   setCyclePhase('compress');
        //   setCompletedCycles(newCycles);

        //   console.log("✅ Full CPR Cycle Completed:", newCycles);
        // } else {
        //   cycleBreathCountRef.current = newBreathCount;
        //   setCycleBreathCount(newBreathCount);
        // }

        if (data.breathCount >= BREATHS_PER_CYCLE) {

          const newCycles = completedCyclesRef.current + 1;

          // ✅ show 2/2 immediately
          cycleBreathCountRef.current = newBreathCount;
          setCycleBreathCount(newBreathCount);

          console.log("✅ 2 breaths done — waiting before advancing");

          setTimeout(() => {

            cycleCompressionCountRef.current = 0;
            cycleBreathCountRef.current = 0;

            cyclePhaseRef.current = 'compress';
            completedCyclesRef.current = newCycles;

            setCycleCompressionCount(0);
            setCycleBreathCount(0);
            setCyclePhase('compress');

            // 🔥 THIS triggers auto-advance
            setCompletedCycles(newCycles);

            console.log("➡️ Auto advancing after delay");

          }, 600);
        }

        if (data.breathDetected) {
          console.log("🌬️ Breath UI Triggered", data.airPressure);
        }

        setMetrics(prev => ({
          ...prev,
          breaths: {
            count: prev.breaths.count + 1,
            currentPressure: data.airPressure,
            goodBreaths: prev.breaths.goodBreaths + (isGoodBreath ? 1 : 0),
            totalBreaths: prev.breaths.totalBreaths + 1,
          },
        }));
      }
    });
    //end of Satya Code

    const unsubStatus = arduinoSerial.onStatusChange(setConnectionStatus);
    const unsubMode = arduinoSerial.onModeChange(setConnectionMode);
    const unsubHwOnly = arduinoSerial.onHardwareOnlyChange(setHardwareOnly);

    return () => {
      unsubData();
      unsubStatus();
      unsubMode();
      unsubHwOnly();
    };
  }, []);

  useEffect(() => {
    if (isTraining && !isPaused) {
      timerRef.current = setInterval(() => {
        setStepTimer(prev => prev + 1);
        setMetrics(prev => ({
          ...prev,
          elapsedTime: Date.now() - prev.startTime,
        }));
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTraining, isPaused]);

  const setMode = useCallback((m: TrainingMode) => {
    setModeState(m);
  }, []);

  const startTraining = useCallback(() => {
    setIsTraining(true);
    setIsPaused(false);
    setCurrentStepIndex(0);
    setStepTimer(0);
    setMetrics({ ...defaultMetrics, startTime: Date.now(), compressions: { ...defaultMetrics.compressions, sets: makeDefaultSets(COMPRESSION_SETS_REQUIRED) } });
    setAedShockDelivered(false);
    setHandPlacementVerified(false);
    setPostAedCompressionCount(0);
    compressionRates.current = [];
    lastCompressionTime.current = 0;
    cyclePhaseRef.current = 'compress';
    cycleCompressionCountRef.current = 0;
    cycleBreathCountRef.current = 0;
    completedCyclesRef.current = 0;
    setCyclePhase('compress');
    setCycleCompressionCount(0);
    setCycleBreathCount(0);
    setCompletedCycles(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const pauseTraining = useCallback(() => {
    setIsPaused(true);
  }, []);

  const resumeTraining = useCallback(() => {
    setIsPaused(false);
  }, []);

  const resetTraining = useCallback(() => {
    setIsTraining(false);
    setIsPaused(false);
    setCurrentStepIndex(0);
    setStepTimer(0);
    setMetrics(defaultMetrics);
    setAedShockDelivered(false);
    setHandPlacementVerified(false);
    setPostAedCompressionCount(0);
    compressionRates.current = [];
    lastCompressionTime.current = 0;
    cyclePhaseRef.current = 'compress';
    cycleCompressionCountRef.current = 0;
    cycleBreathCountRef.current = 0;
    completedCyclesRef.current = 0;
    setCyclePhase('compress');
    setCycleCompressionCount(0);
    setCycleBreathCount(0);
    setCompletedCycles(0);
    if (!arduinoSerial.getHardwareOnly()) {
      arduinoSerial.resetSimState();
    }
  }, []);

  const advanceStep = useCallback(() => {
    if (currentStepIndex < CPR_STEPS.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
      setStepTimer(0);
      setMetrics(prev => ({
        ...prev,
        compressions: {
          ...prev.compressions,
          count: 0,
          currentRate: 0,
          currentDepth: 0,
          rateHistory: [],
          depthHistory: [],
          sets: makeDefaultSets(COMPRESSION_SETS_REQUIRED),
          currentSetIndex: 0,
        },
        breaths: {
          ...prev.breaths,
          count: 0,
          currentPressure: 0,
        },
      }));
      setPostAedCompressionCount(0);
      compressionRates.current = [];
      lastCompressionTime.current = 0;
      cyclePhaseRef.current = 'compress';
      cycleCompressionCountRef.current = 0;
      cycleBreathCountRef.current = 0;
      completedCyclesRef.current = 0;
      setCyclePhase('compress');
      setCycleCompressionCount(0);
      setCycleBreathCount(0);
      setCompletedCycles(0);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      const score = metrics.compressions.totalCompressions > 0
        ? Math.round((metrics.compressions.goodCompressions / metrics.compressions.totalCompressions) * 100)
        : 100;
      setMetrics(prev => ({ ...prev, overallScore: score }));
      setCurrentStepIndex(CPR_STEPS.length);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [currentStepIndex, metrics]);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < CPR_STEPS.length) {
      setCurrentStepIndex(index);
      setStepTimer(0);
      setHandPlacementVerified(false);
      resetCycleState();
    }
  }, [resetCycleState]);

  const connectArduino = useCallback(async () => {
    return await arduinoSerial.connect();
  }, []);

  const disconnectArduino = useCallback(() => {
    arduinoSerial.disconnect();
  }, []);

  const simulateSensor = useCallback((sensor: string, value: boolean) => {
    if (arduinoSerial.getHardwareOnly()) return;
    type SimTouchSensor = 'leftShoulder' | 'rightShoulder' | 'aedUpper' | 'aedLower' | 'neckTilt';
    const validSensors: SimTouchSensor[] = ['leftShoulder', 'rightShoulder', 'aedUpper', 'aedLower', 'neckTilt'];
    const match = validSensors.find(s => s === sensor);
    if (match) {
      arduinoSerial.simulateTouchSensor(match, value);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const simulateNeckTilt = useCallback(() => {
    if (arduinoSerial.getHardwareOnly()) return;
    arduinoSerial.simulateTouchSensor('neckTilt', true);
    setTimeout(() => arduinoSerial.simulateTouchSensor('neckTilt', false), 500);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const deliverShock = useCallback(() => {
    setAedShockDelivered(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const setCameraPermission = useCallback((granted: boolean) => {
    setCameraPermissionGranted(granted);
  }, []);

  const verifyHandPlacement = useCallback(() => {
    setHandPlacementVerified(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const simulateCompression = useCallback(() => {
    if (arduinoSerial.getHardwareOnly()) return;
    arduinoSerial.simulateCompression(true);
    setTimeout(() => arduinoSerial.simulateCompression(false), 200);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);

  const simulateBreath = useCallback(() => {
    if (arduinoSerial.getHardwareOnly()) return;
    arduinoSerial.simulateBreath(true);
    setTimeout(() => arduinoSerial.simulateBreath(false), 800);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const value = useMemo<CPRTrainingContextValue>(() => ({
    mode,
    currentStepIndex,
    currentStepId: currentStepId as CPRStepId,
    isTraining,
    isPaused,
    sensorData,
    connectionStatus,
    connectionMode,
    hardwareOnly,
    metrics,
    stepTimer,
    aedShockDelivered,
    cameraPermissionGranted,
    handPlacementVerified,
    postAedCompressionCount,
    cyclePhase,
    cycleCompressionCount,
    cycleBreathCount,
    completedCycles,
    setMode,
    startTraining,
    pauseTraining,
    resumeTraining,
    resetTraining,
    advanceStep,
    goToStep,
    connectArduino,
    disconnectArduino,
    simulateSensor,
    simulateNeckTilt,
    deliverShock,
    setCameraPermission,
    verifyHandPlacement,
    simulateCompression,
    simulateBreath,
  }), [
    mode, currentStepIndex, currentStepId, isTraining, isPaused, sensorData,
    connectionStatus, connectionMode, hardwareOnly, metrics, stepTimer,
    aedShockDelivered, cameraPermissionGranted, handPlacementVerified, postAedCompressionCount,
    cyclePhase, cycleCompressionCount, cycleBreathCount, completedCycles,
    setMode, startTraining, pauseTraining, resumeTraining, resetTraining,
    advanceStep, goToStep, connectArduino, disconnectArduino,
    simulateSensor, simulateNeckTilt, deliverShock,
    setCameraPermission, verifyHandPlacement, simulateCompression, simulateBreath,
  ]);

  return (
    <CPRTrainingContext.Provider value={value}>
      {children}
    </CPRTrainingContext.Provider>
  );
}

export function useCPRTraining() {
  const context = useContext(CPRTrainingContext);
  if (!context) {
    throw new Error('useCPRTraining must be used within CPRTrainingProvider');
  }
  return context;
}
