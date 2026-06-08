const JPEG_QUALITY = 0.6;

export function captureVideoFrame(video: HTMLVideoElement | null): string | null {
  if (!video || video.readyState < 2) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return null;
  }
}
