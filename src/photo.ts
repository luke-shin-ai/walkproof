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

/**
 * A photo the app refuses to store. The record is written around it, so the
 * reason has to read like advice, not like a stack trace.
 */
export class PhotoRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoRefused";
  }
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

/**
 * Re-encodes the photo through a canvas before it is stored. The pixels stay on
 * the device; the metadata, including GPS, does not survive the re-encode.
 *
 * Two cases are refused instead of stored: a file with no bytes, and a file this
 * device cannot decode and re-encode. Keeping the original in that second case
 * would keep its EXIF location with it, which is the opposite of what the record
 * promises, so the caller is told and the item is recorded without the photo.
 */
export async function preparePhoto(file: File, maxEdge = 1280, quality = 0.82): Promise<PreparedPhoto> {
  if (!file || file.size === 0) {
    throw new PhotoRefused("the photo has no bytes (0 B), so it was not stored. Take the photo again.");
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new PhotoRefused(
      "this device could not decode the photo, so it was not stored: the original file would still carry its EXIF location. Take the photo in a browser that can re-encode it.",
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new PhotoRefused(
      `this device could not decode the photo (${(error as Error).message}), so it was not stored: the original file would still carry its EXIF location.`,
    );
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas context");
    context.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const { mimeType, base64 } = splitDataUrl(dataUrl);
    const bytes = bytesFromBase64(base64);
    if (!bytes) throw new Error("the re-encoded photo is empty");
    return { dataUrl, base64, mimeType, bytes, width, height, exifStripped: true };
  } catch (error) {
    throw new PhotoRefused(
      `this device could not re-encode the photo (${(error as Error).message}), so it was not stored: the original file would still carry its EXIF location.`,
    );
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}
