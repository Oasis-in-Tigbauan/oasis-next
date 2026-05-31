import * as Sentry from "@sentry/nextjs";
import sharp from "sharp";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export async function tryReadImage(
  value: File,
  options: TryReadImageOptions = { maxSize: MAX_IMAGE_BYTES },
): Promise<{ data: Uint8Array; format: "png" | "jpeg" } | null> {
  if (!(value instanceof File)) return null;

  try {
    // Should not exceed the specified max size.
    if (value.size > (options.maxSize ?? MAX_IMAGE_BYTES)) {
      return null;
    }

    const buf = await value.arrayBuffer();
    const bufUint8Array = new Uint8Array(buf);

    // Validate the format.
    const img = await sharp(bufUint8Array).metadata();

    // Only accept formats such as PNG and JPEG.
    if (img.format !== "png" && img.format !== "jpeg" && img.format !== "jpg") {
      return null;
    }

    const format = img.format === "png" ? "png" : "jpeg";

    return { data: bufUint8Array, format };
  } catch (e) {
    Sentry.captureException(e);
    return null;
  }
}

type TryReadImageOptions = {
  maxSize?: number;
}
