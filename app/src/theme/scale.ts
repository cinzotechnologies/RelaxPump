import { Dimensions } from 'react-native';

/** The design frame is 390 × 844. Scale every size with the screen width. */
const DESIGN_WIDTH = 390;
const width = Dimensions.get('window').width;
export const scaleFactor = Math.min(1.15, Math.max(0.82, width / DESIGN_WIDTH));

/** Scale a design pixel value to the current screen. */
export function s(px: number): number {
  return Math.round(px * scaleFactor * 2) / 2;
}
