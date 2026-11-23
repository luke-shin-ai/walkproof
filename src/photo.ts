export interface PreparedPhoto {
  dataUrl: string;
  base64: string;
  mimeType: string;
  bytes: number;
  width: number;
  height: number;
  /** True when the device re-encoded the image, which drops EXIF and other metadata. */
  exifStripped: boolean;
}

function bytesFromBase64(base64: string): number {
  return Math.round((base64.length * 3) / 4);
}

function splitDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const mimeType = header.slice(header.indexOf(":") + 1, header.indexOf(";")) || "image/jpeg";
  return { mimeType, base64: dataUrl.slice(comma + 1) };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

/**
 * Re-encodes the photo through a canvas before it is stored. The pixels stay on
 * the device; the metadata, including GPS, does not survive the re-encode.
 */
export async function preparePhoto(file: File, maxEdge = 1280, quality = 0.82): Promise<PreparedPhoto> {
  try {
    if (typeof createImageBitmap !== "function" || typeof document === "undefined") throw new Error("no image decoder");
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas context");
    context.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === "function") bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const { mimeType, base64 } = splitDataUrl(dataUrl);
    return { dataUrl, base64, mimeType, bytes: bytesFromBase64(base64), width, height, exifStripped: true };
  } catch {
    const dataUrl = await readFileAsDataUrl(file);
    const { mimeType, base64 } = splitDataUrl(dataUrl);
    return { dataUrl, base64, mimeType, bytes: bytesFromBase64(base64), width: 0, height: 0, exifStripped: false };
  }
}
