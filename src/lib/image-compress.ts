const MAX_BYTES = 500_000;
const MAX_DIMENSION = 1600;

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/** Resize and re-encode as JPEG until under maxBytes; returns data:image/jpeg;base64,... */
export async function compressImageToDataUrl(
  file: File,
  maxBytes = MAX_BYTES,
): Promise<string> {
  const img = await loadImageFromFile(file);
  let { width, height } = img;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法处理图片");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);
  if (!blob) throw new Error("图片压缩失败");

  while (blob.size > maxBytes && quality > 0.3) {
    quality -= 0.08;
    const next = await canvasToBlob(canvas, quality);
    if (!next) break;
    blob = next;
  }

  if (blob.size > maxBytes) {
    const smaller = document.createElement("canvas");
    smaller.width = Math.max(1, Math.round(width * 0.7));
    smaller.height = Math.max(1, Math.round(height * 0.7));
    const sctx = smaller.getContext("2d");
    if (!sctx) throw new Error("无法处理图片");
    sctx.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    quality = 0.75;
    blob = (await canvasToBlob(smaller, quality)) ?? blob;
    while (blob.size > maxBytes && quality > 0.28) {
      quality -= 0.1;
      const next = await canvasToBlob(smaller, quality);
      if (!next) break;
      blob = next;
    }
  }

  if (blob.size > maxBytes) {
    throw new Error("图片过大，请换一张更小的照片");
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("图片读取失败"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(blob);
  });

  return base64;
}
