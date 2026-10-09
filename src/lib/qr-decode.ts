import jsQR from 'jsqr';

/**
 * 在浏览器本地把二维码图片解码成它背后的文本（通常是 https://qr.alipay.com/xxx 收款链接）。
 * 走 canvas + jsQR，不发任何网络请求，图片不会上传到第三方解码站点。
 * 同一张图会被自动降采样重试几次，提高大图 / 小图的识别成功率。
 */
export async function decodeQrFromImage(file: File | string): Promise<string | null> {
  const img = await loadImage(file);
  for (const size of [600, 900, 1200, 400]) {
    try {
      const code = scan(img, size);
      if (code) return code;
    } catch {
      /* 换下一个尺寸继续试 */
    }
  }
  return null;
}

async function loadImage(file: File | string): Promise<HTMLImageElement> {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      // 仅同源的 CDN 图片能被 canvas 读取像素；跨域未开 CORS 时 toDataURL 会抛错，由上层捕获
      im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('图片加载失败'));
      im.src = url;
    });
  } finally {
    if (typeof file !== 'string') URL.revokeObjectURL(url);
  }
}

function scan(img: HTMLImageElement, size: number): string | null {
  const ratio = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * ratio));
  const h = Math.max(1, Math.round(img.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const result = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
  return result?.data?.trim() || null;
}
