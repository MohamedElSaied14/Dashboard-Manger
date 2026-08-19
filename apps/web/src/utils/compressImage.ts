const SERVER_IMAGE_LIMIT = 10 * 1024 * 1024;
const TARGET_IMAGE_SIZE = 9 * 1024 * 1024;
const MAX_CANVAS_EDGE = 6000;

export async function compressImageForUpload(file: File): Promise<File> {
  if (file.size <= SERVER_IMAGE_LIMIT) return file;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Images larger than 10 MB must be JPG, PNG, or WEBP");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const initialScale = Math.min(
      1,
      MAX_CANVAS_EDGE / Math.max(bitmap.width, bitmap.height),
      Math.sqrt(TARGET_IMAGE_SIZE / file.size),
    );
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    let quality = 0.9;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("This browser cannot compress the selected image");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", quality),
      );
      if (!blob) throw new Error("Image compression failed");
      if (blob.size <= TARGET_IMAGE_SIZE) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        return new File([blob], `${baseName}-compressed.webp`, {
          type: "image/webp",
          lastModified: Date.now(),
        });
      }

      quality = Math.max(0.55, quality - 0.08);
      width = Math.max(1, Math.round(width * 0.88));
      height = Math.max(1, Math.round(height * 0.88));
    }
  } finally {
    bitmap.close();
  }

  throw new Error("The image is still larger than 10 MB after compression");
}
