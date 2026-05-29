import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';

export interface LayoutInfo {
  width: number;
  height: number;
  isLandscape: boolean;
  isPortrait: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isNarrow: boolean;
  useSideBySide: boolean;
  scale: number;
}

export function useResponsiveLayout(): LayoutInfo {
  const [dims, setDims] = useState(() => Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setDims(window);
    });
    return () => sub.remove();
  }, []);

  const { width, height } = dims;
  const isLandscape = width > height;
  const isPortrait = !isLandscape;
  const shortSide = Math.min(width, height);
  const isTablet = shortSide >= 600;
  const isPhone = !isTablet;
  const isNarrow = width < 600;
  const useSideBySide = isLandscape && width >= 600;
  const scale = isPhone ? 0.85 : 1;

  return {
    width,
    height,
    isLandscape,
    isPortrait,
    isPhone,
    isTablet,
    isNarrow,
    useSideBySide,
    scale,
  };
}
