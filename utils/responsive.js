import { useWindowDimensions } from 'react-native';

// Shared tablet breakpoint + content cap, matching the maxWidth already used
// in ForYouScreen/SocialScreen's `tabletWrap` style. Centralized here so every
// screen reacts to rotation/split-screen resize instead of freezing
// Dimensions.get('window') at module load (which never updates afterward).
export const TABLET_BREAKPOINT = 768;
export const TABLET_CONTENT_MAX_WIDTH = 640;
export const TABLET_GRID_MAX_WIDTH = 900;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  return { width, height, isTablet };
}

// Pick a value (e.g. column count) based on tablet vs phone, reactive to width.
export function useTabletValue(phoneValue, tabletValue) {
  const { isTablet } = useResponsive();
  return isTablet ? tabletValue : phoneValue;
}
