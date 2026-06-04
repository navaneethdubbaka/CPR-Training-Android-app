/** Map normalized (0–1) video coords to view pixels for object-fit: cover + optional mirror. */
export function videoNormToViewPx(
  nx: number,
  ny: number,
  videoWidth: number,
  videoHeight: number,
  viewWidth: number,
  viewHeight: number,
  mirrorX: boolean,
): { px: number; py: number } {
  if (!videoWidth || !videoHeight || !viewWidth || !viewHeight) {
    let px = nx * viewWidth;
    const py = ny * viewHeight;
    if (mirrorX) px = viewWidth - px;
    return { px, py };
  }

  const scale = Math.max(viewWidth / videoWidth, viewHeight / videoHeight);
  const displayedW = videoWidth * scale;
  const displayedH = videoHeight * scale;
  const offsetX = (viewWidth - displayedW) / 2;
  const offsetY = (viewHeight - displayedH) / 2;

  let px = offsetX + nx * displayedW;
  const py = offsetY + ny * displayedH;
  if (mirrorX) px = viewWidth - px;
  return { px, py };
}
