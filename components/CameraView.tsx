// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { View, Text, StyleSheet, Pressable, Platform, LayoutChangeEvent } from 'react-native';
// import { CameraView as ExpoCameraView, useCameraPermissions } from 'expo-camera';
// import { MaterialCommunityIcons } from '@expo/vector-icons';
// import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';
// import { getColors } from '@/constants/colors';
// import { useTheme } from '@/contexts/ThemeContext';
// import { handTrackingEngine, type PlacementResult } from '@/lib/hand-tracking';
// import { PoseCameraView } from '@/components/PoseCameraView';

// interface CameraViewProps {
//   onHandDetected?: () => void;
//   showOverlay?: boolean;
//   overlayText?: string;
//   enableHandTracking?: boolean;
// }

// const STERNAL_ZONE = { x: 0.35, y: 0.3, w: 0.3, h: 0.35 };

// const HAND_CONNECTIONS: [number, number][] = [
//   [0, 1], [1, 2], [2, 3], [3, 4],
//   [0, 5], [5, 6], [6, 7], [7, 8],
//   [0, 9], [9, 10], [10, 11], [11, 12],
//   [0, 13], [13, 14], [14, 15], [15, 16],
//   [0, 17], [17, 18], [18, 19], [19, 20],
//   [5, 9], [9, 13], [13, 17],
// ];

// function HandOverlay({
//   result,
//   width,
//   height,
//   hardwareOnly,
//   Colors,
// }: {
//   result: PlacementResult | null;
//   width: number;
//   height: number;
//   hardwareOnly?: boolean;
//   Colors: ReturnType<typeof getColors>;
// }) {
//   if (!width || !height) return null;

//   const zoneX = STERNAL_ZONE.x * width;
//   const zoneY = STERNAL_ZONE.y * height;
//   const zoneW = STERNAL_ZONE.w * width;
//   const zoneH = STERNAL_ZONE.h * height;

//   const inZone = result?.inZone ?? false;
//   const zoneColor = inZone ? Colors.feedbackGood : Colors.accent;
//   const zoneFill = inZone ? 'rgba(0, 230, 118, 0.12)' : 'rgba(229, 57, 53, 0.10)';

//   const directionHint = result?.directionHint;
//   const hands = result?.hands ?? [];

//   const arrowMap: Record<string, string> = {
//     up: '↑',
//     down: '↓',
//     left: '←',
//     right: '→',
//   };
//   const arrow = directionHint && directionHint !== 'center' ? arrowMap[directionHint] : null;

//   return (
//     <Svg
//       style={StyleSheet.absoluteFillObject}
//       width={width}
//       height={height}
//       pointerEvents="none"
//     >
//       <Rect
//         x={zoneX}
//         y={zoneY}
//         width={zoneW}
//         height={zoneH}
//         fill={zoneFill}
//         stroke={zoneColor}
//         strokeWidth={2.5}
//         rx={8}
//         opacity={0.9}
//       />
//       <SvgText
//         x={zoneX + zoneW / 2}
//         y={zoneY + 18}
//         textAnchor="middle"
//         fill={zoneColor}
//         fontSize={11}
//         fontWeight="bold"
//       >
//         {inZone ? 'CORRECT POSITION' : 'STERNAL TARGET'}
//       </SvgText>

//       {!hardwareOnly && hands.map((hand, hi) => (
//         <React.Fragment key={hi}>
//           {HAND_CONNECTIONS.map(([a, b], ci) => {
//             const la = hand.landmarks[a];
//             const lb = hand.landmarks[b];
//             if (!la || !lb) return null;
//             return (
//               <Line
//                 key={ci}
//                 x1={la.x * width}
//                 y1={la.y * height}
//                 x2={lb.x * width}
//                 y2={lb.y * height}
//                 stroke="rgba(255,255,255,0.6)"
//                 strokeWidth={1.5}
//               />
//             );
//           })}
//           {hand.landmarks.map((lm, li) => (
//             <Circle
//               key={li}
//               cx={lm.x * width}
//               cy={lm.y * height}
//               r={li === 0 ? 5 : 3}
//               fill={li === 0 ? Colors.accentLight : 'rgba(255,255,255,0.85)'}
//             />
//           ))}
//         </React.Fragment>
//       ))}

//       {!inZone && arrow && (
//         <SvgText
//           x={width / 2}
//           y={height - 28}
//           textAnchor="middle"
//           fill={Colors.warning}
//           fontSize={28}
//           fontWeight="bold"
//         >
//           {arrow}
//         </SvgText>
//       )}
//     </Svg>
//   );
// }

// export function CameraViewComponent({
//   onHandDetected,
//   showOverlay = true,
//   overlayText,
//   enableHandTracking = false,
// }: CameraViewProps) {
//   const { theme } = useTheme();
//   const Colors = getColors(theme);
//   const [permission, requestPermission] = useCameraPermissions();
//   const [facing, setFacing] = useState<'front' | 'back'>('back');
//   const [trackingResult, setTrackingResult] = useState<PlacementResult | null>(null);
//   const [engineReady, setEngineReady] = useState(false);
//   const [viewSize, setViewSize] = useState({ width: 0, height: 0 });
//   const detectedRef = useRef(false);
//   const detectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

//   const handleLayout = useCallback((e: LayoutChangeEvent) => {
//     const { width, height } = e.nativeEvent.layout;
//     setViewSize({ width, height });
//   }, []);

//   useEffect(() => {
//     if (!enableHandTracking) return;

//     let mounted = true;

//     handTrackingEngine.initialize().then(() => {
//       if (mounted) setEngineReady(true);
//     });

//     return () => { mounted = false; };
//   }, [enableHandTracking]);

//   useEffect(() => {
//     if (!engineReady || !enableHandTracking) return;

//     const callback = (result: PlacementResult) => {
//       setTrackingResult(result);

//       if (result.inZone && !detectedRef.current && onHandDetected) {
//         if (!detectionTimeoutRef.current) {
//           detectionTimeoutRef.current = setTimeout(() => {
//             if (!detectedRef.current) {
//               detectedRef.current = true;
//               onHandDetected();
//             }
//             detectionTimeoutRef.current = null;
//           }, 1200);
//         }
//       } else if (!result.inZone && detectionTimeoutRef.current) {
//         clearTimeout(detectionTimeoutRef.current);
//         detectionTimeoutRef.current = null;
//       }
//     };

//     handTrackingEngine.start(callback);
//     return () => {
//       handTrackingEngine.stop(callback);
//       if (detectionTimeoutRef.current) {
//         clearTimeout(detectionTimeoutRef.current);
//         detectionTimeoutRef.current = null;
//       }
//     };
//   }, [engineReady, enableHandTracking, onHandDetected]);

//   if (!permission) {
//     return (
//       <View style={styles.container}>
//         <View style={[styles.placeholder, { backgroundColor: Colors.surface }]}>
//           <MaterialCommunityIcons name="camera-off" size={40} color={Colors.textMuted} />
//           <Text style={[styles.placeholderText, { color: Colors.textSecondary }]}>Loading camera...</Text>
//         </View>
//       </View>
//     );
//   }

//   if (!permission.granted) {
//     return (
//       <View style={styles.container}>
//         <View style={[styles.placeholder, { backgroundColor: Colors.surface }]}>
//           <MaterialCommunityIcons name="camera-lock" size={40} color={Colors.textMuted} />
//           <Text style={[styles.placeholderText, { color: Colors.textSecondary }]}>Camera access needed for hand placement verification</Text>
//           <Pressable
//             style={[styles.permissionBtn, { backgroundColor: Colors.accent }]}
//             onPress={requestPermission}
//           >
//             <MaterialCommunityIcons name="camera" size={18} color="#FFFFFF" />
//             <Text style={styles.permissionBtnText}>Grant Access</Text>
//           </Pressable>
//           {onHandDetected && (
//             <Pressable style={styles.simulateBtn} onPress={onHandDetected}>
//               <MaterialCommunityIcons name="hand-okay" size={18} color={Colors.text} />
//               <Text style={styles.simulateBtnText}>Manual Confirm</Text>
//             </Pressable>
//           )}
//           <Text style={styles.subText}>Hardware-only mode: confirm hand placement manually</Text>
//         </View>
//       </View>
//     );
//   }

//   if (Platform.OS === 'android' && enableHandTracking) {
//     return (
//       <PoseCameraView
//         onHandDetected={onHandDetected}
//         enableHandTracking={enableHandTracking}
//         showOverlay={showOverlay}
//         overlayText={overlayText}
//       />
//     );
//   }

//   if (Platform.OS === 'web') {
//     const inZone = trackingResult?.inZone ?? false;
//     const directionHint = trackingResult?.directionHint;
//     const arrowMap: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };
//     const arrow = directionHint && directionHint !== 'center' ? arrowMap[directionHint] : null;

//     return (
//       <View style={styles.container} onLayout={handleLayout}>
//         <View style={[styles.placeholder, { backgroundColor: Colors.surface }]}>
//           <MaterialCommunityIcons name="camera" size={40} color={Colors.accent} />
//           <Text style={[styles.placeholderText, { color: Colors.textSecondary }]}>Camera preview available on device</Text>
//           <Text style={[styles.subText, { color: Colors.textMuted }]}>Use Expo Go on your tablet for full camera functionality</Text>

//           {enableHandTracking && (
//             <View style={[styles.statusChip, { backgroundColor: inZone ? 'rgba(0,230,118,0.15)' : 'rgba(229,57,53,0.15)' }]}>
//               <MaterialCommunityIcons
//                 name={inZone ? 'hand-okay' : 'hand-pointing-up'}
//                 size={16}
//                 color={inZone ? Colors.feedbackGood : Colors.accent}
//               />
//               <Text style={[styles.statusChipText, { color: inZone ? Colors.feedbackGood : Colors.warning }]}>
//                 {inZone ? 'Hands in correct position' : arrow ? `Move hands ${directionHint}` : 'Tracking hands...'}
//               </Text>
//             </View>
//           )}

//           {onHandDetected && (
//             <Pressable style={[styles.simulateBtn, { backgroundColor: Colors.surfaceHighlight }]} onPress={onHandDetected}>
//               <MaterialCommunityIcons name="gesture-tap" size={18} color={Colors.text} />
//               <Text style={[styles.simulateBtnText, { color: Colors.text }]}>Simulate Detection</Text>
//             </Pressable>
//           )}
//         </View>
//         {showOverlay && overlayText && (
//           <View style={styles.overlay}>
//             <Text style={styles.overlayText}>{overlayText}</Text>
//           </View>
//         )}
//       </View>
//     );
//   }

//   return (
//     <View style={styles.container} onLayout={handleLayout}>
//       <ExpoCameraView
//         style={styles.camera}
//         facing={facing}
//       >
//         {showOverlay && (
//           <View style={styles.cameraOverlay}>
//             {!enableHandTracking && (
//               <>
//                 <View style={styles.targetBox}>
//                   <View style={[styles.corner, styles.topLeft, { borderColor: Colors.accent }]} />
//                   <View style={[styles.corner, styles.topRight, { borderColor: Colors.accent }]} />
//                   <View style={[styles.corner, styles.bottomLeft, { borderColor: Colors.accent }]} />
//                   <View style={[styles.corner, styles.bottomRight, { borderColor: Colors.accent }]} />
//                 </View>
//                 {overlayText && (
//                   <Text style={styles.overlayText}>{overlayText}</Text>
//                 )}
//               </>
//             )}
//           </View>
//         )}
//       </ExpoCameraView>

//       {enableHandTracking && viewSize.width > 0 && (
//         <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
//           <HandOverlay
//             result={trackingResult}
//             width={viewSize.width}
//             height={viewSize.height}
//             Colors={Colors}
//           />
//           {trackingResult && !trackingResult.inZone && trackingResult.directionHint && trackingResult.directionHint !== 'center' && (
//             <View style={styles.directionBanner}>
//               <MaterialCommunityIcons name="arrow-all" size={14} color={Colors.warning} />
//               <Text style={styles.directionText}>
//                 Move hands to center of chest
//               </Text>
//             </View>
//           )}
//           {trackingResult?.inZone && (
//             <View style={[styles.directionBanner, { backgroundColor: 'rgba(0,230,118,0.2)', borderColor: Colors.feedbackGood }]}>
//               <MaterialCommunityIcons name="check-circle" size={14} color={Colors.feedbackGood} />
//               <Text style={[styles.directionText, { color: Colors.feedbackGood }]}>
//                 Correct placement — hold steady...
//               </Text>
//             </View>
//           )}
//         </View>
//       )}

//       {!enableHandTracking && showOverlay && overlayText && (
//         <View style={styles.overlay}>
//           <Text style={styles.overlayText}>{overlayText}</Text>
//         </View>
//       )}

//       <Pressable
//         style={styles.flipBtn}
//         onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
//       >
//         <MaterialCommunityIcons name="camera-flip" size={20} color="#FFFFFF" />
//       </Pressable>

//       {enableHandTracking && (
//         <View style={styles.trackingBadge}>
//           <View style={[styles.trackingDot, { backgroundColor: engineReady ? Colors.feedbackGood : Colors.warning }]} />
//           <Text style={[styles.trackingLabel, { color: Colors.text }]}>{engineReady ? 'TRACKING' : 'LOADING'}</Text>
//         </View>
//       )}
//     </View>
//   );
// }

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     borderRadius: 12,
//     overflow: 'hidden',
//     backgroundColor: '#000',
//     position: 'relative',
//   },
//   camera: {
//     flex: 1,
//   },
//   placeholder: {
//     flex: 1,
//     alignItems: 'center',
//     justifyContent: 'center',
//     gap: 10,
//     padding: 16,
//   },
//   placeholderText: {
//     fontSize: 13,
//     textAlign: 'center',
//   },
//   subText: {
//     fontSize: 11,
//     textAlign: 'center',
//   },
//   permissionBtn: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 6,
//     paddingHorizontal: 16,
//     paddingVertical: 10,
//     borderRadius: 8,
//     marginTop: 4,
//   },
//   permissionBtnText: {
//     fontSize: 13,
//     fontWeight: '600',
//     color: '#FFFFFF',
//   },
//   simulateBtn: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 6,
//     paddingHorizontal: 14,
//     paddingVertical: 8,
//     borderRadius: 8,
//     marginTop: 4,
//   },
//   simulateBtnText: {
//     fontSize: 12,
//     fontWeight: '600',
//   },
//   cameraOverlay: {
//     ...StyleSheet.absoluteFillObject,
//     alignItems: 'center',
//     justifyContent: 'center',
//     backgroundColor: 'rgba(0,0,0,0.3)',
//   },
//   targetBox: {
//     width: 180,
//     height: 140,
//     position: 'relative',
//   },
//   corner: {
//     position: 'absolute',
//     width: 30,
//     height: 30,
//   },
//   topLeft: {
//     top: 0,
//     left: 0,
//     borderTopWidth: 3,
//     borderLeftWidth: 3,
//   },
//   topRight: {
//     top: 0,
//     right: 0,
//     borderTopWidth: 3,
//     borderRightWidth: 3,
//   },
//   bottomLeft: {
//     bottom: 0,
//     left: 0,
//     borderBottomWidth: 3,
//     borderLeftWidth: 3,
//   },
//   bottomRight: {
//     bottom: 0,
//     right: 0,
//     borderBottomWidth: 3,
//     borderRightWidth: 3,
//   },
//   overlay: {
//     position: 'absolute',
//     bottom: 0,
//     left: 0,
//     right: 0,
//     backgroundColor: 'rgba(0,0,0,0.6)',
//     padding: 8,
//   },
//   overlayText: {
//     fontSize: 12,
//     fontWeight: '600',
//     color: '#FFFFFF',
//     textAlign: 'center',
//     marginTop: 8,
//   },
//   flipBtn: {
//     position: 'absolute',
//     top: 8,
//     right: 8,
//     width: 32,
//     height: 32,
//     borderRadius: 16,
//     backgroundColor: 'rgba(0,0,0,0.5)',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   trackingBadge: {
//     position: 'absolute',
//     top: 8,
//     left: 8,
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 4,
//     backgroundColor: 'rgba(0,0,0,0.6)',
//     paddingHorizontal: 8,
//     paddingVertical: 4,
//     borderRadius: 10,
//   },
//   trackingDot: {
//     width: 6,
//     height: 6,
//     borderRadius: 3,
//   },
//   trackingLabel: {
//     fontSize: 9,
//     fontWeight: '700',
//     letterSpacing: 0.5,
//   },
//   directionBanner: {
//     position: 'absolute',
//     bottom: 12,
//     left: 12,
//     right: 12,
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 6,
//     backgroundColor: 'rgba(229,57,53,0.2)',
//     borderRadius: 8,
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     borderWidth: 1,
//   },
//   directionText: {
//     fontSize: 12,
//     fontWeight: '700',
//     flex: 1,
//   },
//   statusChip: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 6,
//     paddingHorizontal: 12,
//     paddingVertical: 8,
//     borderRadius: 20,
//     marginTop: 4,
//   },
//   statusChipText: {
//     fontSize: 12,
//     fontWeight: '600',
//   },
// });


import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Button,
  StyleSheet,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

interface CameraViewProps {
  onHandDetected?: () => void;
  showOverlay?: boolean;
  overlayText?: string;
  enableHandTracking?: boolean;
}

export default function CameraViewComponent({
  onHandDetected,
  showOverlay = true,
  overlayText,
  enableHandTracking = false,
}: CameraViewProps) {
  const [facing, setFacing] = useState<'front' | 'back'>('back');

  // Mobile permission
  const [permission, requestPermission] = useCameraPermissions();

  // Web states
  const videoRef = useRef<any>(null);
  const [webError, setWebError] = useState<string | null>(null);

  // 🎯 WEB CAMERA LOGIC
  useEffect(() => {
    if (Platform.OS === 'web') {
      startWebCamera();
    }
  }, []);

  const startWebCamera = async () => {
    try {
      if (!navigator.mediaDevices) {
        setWebError('Camera not supported');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      console.log(err);
      setWebError('Permission denied or no camera');
    }
  };

  // 🎯 WEB UI
  if (Platform.OS === 'web') {
    return (
      <View style={styles.wrapper}>
        <View style={styles.frame}>
          {webError ? (
            <View style={styles.center}>
              <Text style={{ color: 'white' }}>{webError}</Text>
              <Button title="Retry" onPress={startWebCamera} />
            </View>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              style={{
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transform: 'scaleX(-1)', // 🔥 REMOVE MIRROR
  }}
            />
          )}
        </View>
      </View>
    );
  }

  // 🎯 MOBILE LOGIC

  useEffect(() => {
    requestPermission();
  }, []);

  if (!permission) {
    return (
      <View style={styles.frame}>
        <Text style={{ color: 'white' }}>Loading...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.frame}>
        <Text style={{ color: 'white' }}>Camera permission required</Text>
        <Button title="Allow Camera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.frame}>
        <CameraView
  style={[
    styles.camera,
    facing === 'front' && { transform: [{ scaleX: -1 }] }, // 🔥 FIX
  ]}
  facing={facing}
/>
      </View>

      <View style={styles.controls}>
        <Button
          title="Flip Camera"
          onPress={() =>
            setFacing((prev) => (prev === 'back' ? 'front' : 'back'))
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    // //alignItems: 'center',
    // justifyContent: 'center',
  },

  frame: {
     width: '100%',
     //height:  ,
     flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'black',
  },

  camera: {
    width: '100%',
    height: '100%',
  },


  webVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',   // 🔥 IMPORTANT
  },

  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  controls: {
    marginTop: 10,
  },
});