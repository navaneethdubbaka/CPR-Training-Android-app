import { type AppTheme } from '@/contexts/ThemeContext';

const DarkColors = {
  primary: '#0A1628',
  primaryLight: '#142240',
  accent: '#E53935',
  accentLight: '#FF6659',
  success: '#00C853',
  successDark: '#009624',
  warning: '#FFB300',
  warningDark: '#C68400',
  danger: '#FF1744',
  info: '#2979FF',
  infoLight: '#75A7FF',

  background: '#0A1628',
  surface: '#1B2838',
  surfaceLight: '#243447',
  surfaceHighlight: '#2E4057',

  text: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.7)',
  textMuted: 'rgba(255,255,255,0.4)',
  textDark: '#0A1628',

  border: 'rgba(255,255,255,0.1)',
  borderLight: 'rgba(255,255,255,0.05)',

  feedbackGood: '#00E676',
  feedbackOk: '#FFAB00',
  feedbackBad: '#FF1744',

  cameraOverlay: 'rgba(0,0,0,0.3)',
  pulseRed: '#FF1744',
  pulseGreen: '#00E676',

  aedOrange: '#FF6D00',
  aedGreen: '#00C853',
  phone911: '#2979FF',
};

const LightColors = {
  primary: '#F5F0E8',
  primaryLight: '#EDE7DA',
  accent: '#E53935',
  accentLight: '#FF6659',
  success: '#00C853',
  successDark: '#009624',
  warning: '#FFB300',
  warningDark: '#C68400',
  danger: '#FF1744',
  info: '#2979FF',
  infoLight: '#75A7FF',

  background: '#F5F0E8',
  surface: '#EDE7DA',
  surfaceLight: '#E4DCCC',
  surfaceHighlight: '#D8CDB8',

  text: '#0A1628',
  textSecondary: 'rgba(10,22,40,0.7)',
  textMuted: 'rgba(10,22,40,0.4)',
  textDark: '#0A1628',

  border: 'rgba(10,22,40,0.12)',
  borderLight: 'rgba(10,22,40,0.06)',

  feedbackGood: '#009624',
  feedbackOk: '#C68400',
  feedbackBad: '#FF1744',

  cameraOverlay: 'rgba(0,0,0,0.3)',
  pulseRed: '#FF1744',
  pulseGreen: '#009624',

  aedOrange: '#FF6D00',
  aedGreen: '#00C853',
  phone911: '#2979FF',
};

export type ColorScheme = typeof DarkColors;

export function getColors(theme: AppTheme): ColorScheme {
  return theme === 'light' ? LightColors : DarkColors;
}

const Colors = DarkColors;
export default Colors;
