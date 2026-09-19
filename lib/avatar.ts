'use client';

/** The size an avatar is stored at. Small enough to sit in a text column. */
const MAX_EDGE = 160;
/** JPEG quality. Below this the compression shows on a face. */
const QUALITY = 0.7;

/**
 * Shrink an uploaded avatar before it is saved.
 *
 * Avatars live in Postgres as a base64 data URL, so what matters is the size
 * of the string. A phone photo is several megabytes; this lands around 8 KB.
 *
 * Was written out twice, identically, in the dashboard and in onboarding,
 * with the two call sites guarding on different conditions.
 */
export function resizeAvatar(dataUrl: string, maxEdge = MAX_EDGE): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.src = dataUrl;
    image.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = image;

      if (width > height) {
        if (width > maxEdge) {
          height = Math.round((height * maxEdge) / width);
          width = maxEdge;
        }
      } else if (height > maxEdge) {
        width = Math.round((width * maxEdge) / height);
        height = maxEdge;
      }

      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    // A file the browser cannot decode is stored as it came in; the upload
    // gate has already capped its size.
    image.onerror = () => resolve(dataUrl);
  });
}

/** True for the freshly-read uploads that still need shrinking. */
export function isUploadedImage(value: string): boolean {
  return value.startsWith('data:');
}
