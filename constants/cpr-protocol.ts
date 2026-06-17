export type CPRStepId =
  | 'scene_safety'
  | 'check_responsiveness'
  | 'call_911'
  | 'hand_placement'
  | 'compressions'
  | 'aed_pads'
  | 'aed_analyze'
  | 'aed_shock'
  | 'post_aed_compressions'
  | 'complete';

export interface CPRStep {
  id: CPRStepId;
  number: number;
  title: string;
  instruction: string;
  detail: string;
  autoAdvance: boolean;
  advanceCondition: string;
  duration?: number;
  requiresCamera?: boolean;
  requiresSensor?: boolean;
  sensorType?: string;
}

export const CPR_STEPS: CPRStep[] = [
  {
    id: 'scene_safety',
    number: 1,
    title: 'Scene Safety',
    instruction: 'Check that the scene is safe',
    detail: 'Look around for hazards. Make sure it is safe for you to approach. Say aloud that the scene is clear to proceed.',
    autoAdvance: false,
    advanceCondition: 'voice_scene_safe',
  },
  {
    id: 'check_responsiveness',
    number: 2,
    title: 'Check Responsiveness',
    instruction: 'Tap shoulder and call out to patient',
    detail: 'Tap one shoulder firmly while shouting to check consciousness. Either shoulder sensor activates, plus verbal confirmation.',
    autoAdvance: true,
    advanceCondition: 'one_shoulder_and_voice',
    requiresSensor: true,
    sensorType: 'touch_shoulders',
  },
  {
    id: 'call_911',
    number: 3,
    title: 'Call for Help',
    instruction: 'Shout loudly for help',
    detail: 'Shout loudly to attract attention. Call for someone to bring an AED and call emergency services (112 / 108). Activate with your voice.',
    autoAdvance: false,
    advanceCondition: 'voice_help_shout',
  },
  {
    id: 'hand_placement',
    number: 4,
    title: 'Hand Placement',
    instruction: 'Place hands on center of chest',
    detail: 'Place the heel of one hand on the center of the chest (lower half of sternum). Place your other hand on top, interlocking fingers. Camera will verify placement.',
    autoAdvance: true,
    advanceCondition: 'camera_hand_detection',
    requiresCamera: true,
    duration: 2,
  },
  {
    id: 'compressions',
    number: 5,
    title: 'Compressions & Rescue Breaths',
    instruction: '30 compressions : 2 breaths per cycle',
    detail: 'Push hard and fast — 5–6 cm deep at 100–120 BPM. After 30 compressions, open airway and give 2 rescue breaths. Repeat the full cycle.',
    autoAdvance: true,
    advanceCondition: 'cycles_complete',
    requiresSensor: true,
    sensorType: 'compression_and_breath',
  },
  {
    id: 'aed_pads',
    number: 6,
    title: 'AED Pad Placement',
    instruction: 'Apply AED pads to bare chest',
    detail: 'Place one pad on the upper right chest (below collarbone). Place the other pad on the lower left side (below the armpit). Touch sensors will detect pad placement.',
    autoAdvance: true,
    advanceCondition: 'both_aed_sensors',
    requiresSensor: true,
    sensorType: 'touch_aed',
  },
  {
    id: 'aed_analyze',
    number: 7,
    title: 'AED Analysis',
    instruction: 'Stand clear — AED analyzing rhythm',
    detail: 'Everyone stand clear of the patient. The AED is analyzing the heart rhythm. Do not touch the patient during analysis.',
    autoAdvance: true,
    advanceCondition: 'aed_analysis_complete',
    duration: 5,
  },
  {
    id: 'aed_shock',
    number: 8,
    title: 'Deliver Shock',
    instruction: 'Press SHOCK button when prompted',
    detail: 'Make sure no one is touching the patient. Press the shock button on the AED control panel when the AED advises a shock.',
    autoAdvance: false,
    advanceCondition: 'shock_delivered',
  },
  {
    id: 'post_aed_compressions',
    number: 9,
    title: 'Post-Shock CPR',
    instruction: 'Complete 2 full 30:2 cycles',
    detail: 'After the shock, immediately resume CPR with 2 full cycles of 30 compressions and 2 rescue breaths at 100–120 BPM. Camera and pose feedback guide your technique.',
    autoAdvance: true,
    advanceCondition: 'post_shock_cycles_complete',
    requiresSensor: true,
    requiresCamera: true,
    sensorType: 'compression_and_breath',
  },
];

export const COMPRESSION_TARGET_RATE = { min: 100, max: 120, ideal: 110 };
export const COMPRESSION_TARGET_DEPTH = { min: 5, max: 6, ideal: 5.5 };
export const COMPRESSIONS_PER_CYCLE = 30;
export const COMPRESSIONS_PER_SET = COMPRESSIONS_PER_CYCLE;
export const BREATHS_PER_CYCLE = 2;
export const COMPRESSION_ACCURACY_GATE = 0.8;
export const CYCLES_TRAINING = 5;
export const CYCLES_TESTING = 1;
export const POST_SHOCK_CYCLES_TRAINING = 2;
export const POST_SHOCK_CYCLES_TESTING = 2;
export const COMPRESSION_SETS_REQUIRED = CYCLES_TRAINING;

export const COMPRESSION_INTERRUPTION_THRESHOLD_MS = 10_000;
export const COMPRESS_TO_BREATH_TARGET_MS = 6_000;

export const AED_STEP_IDS: CPRStepId[] = ['aed_pads', 'aed_analyze', 'aed_shock'];

export function isAedStep(stepId: CPRStepId): boolean {
  return AED_STEP_IDS.includes(stepId);
}

export type SessionTargetMode = 'training' | 'testing';

function getSessionCycleCounts(mode: SessionTargetMode): { mainCycles: number; postShockCycles: number } {
  return mode === 'testing'
    ? { mainCycles: CYCLES_TESTING, postShockCycles: POST_SHOCK_CYCLES_TESTING }
    : { mainCycles: CYCLES_TRAINING, postShockCycles: POST_SHOCK_CYCLES_TRAINING };
}

export function getSessionCompressionTarget(mode: SessionTargetMode): number {
  const { mainCycles, postShockCycles } = getSessionCycleCounts(mode);
  return (mainCycles + postShockCycles) * COMPRESSIONS_PER_CYCLE;
}

export function getSessionBreathTarget(mode: SessionTargetMode): number {
  const { mainCycles, postShockCycles } = getSessionCycleCounts(mode);
  return (mainCycles + postShockCycles) * BREATHS_PER_CYCLE;
}
