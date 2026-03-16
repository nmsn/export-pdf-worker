import greenlet from 'greenlet';

interface CompressImageOptions {
  imageData: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputFormat?: string;
}

interface CompressImageResult {
  data: ArrayBuffer;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
  compressionRatio: string;
}

export const compressImage = greenlet(async ({
  imageData,
  maxWidth = 1920,
  maxHeight = 1080,
  quality = 0.8,
  outputFormat = 'image/jpeg'
}: CompressImageOptions): Promise<CompressImageResult> => {
  try {
    // 方法1: 使用 createImageBitmap (推荐)
    // 首先将 base64 转换为 ArrayBuffer
    const base64Data = imageData.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // 创建 Blob
    const blob = new Blob([bytes], { type: 'image/jpeg' });

    // 使用 createImageBitmap 创建图片
    const imageBitmap = await createImageBitmap(blob);

    // 计算压缩后的尺寸
    const { width, height } = calculateDimensions(
      imageBitmap.width,
      imageBitmap.height,
      maxWidth,
      maxHeight
    );

    // 创建离屏 Canvas
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 绘制压缩后的图片
    ctx!.drawImage(imageBitmap, 0, 0, width, height);

    // 释放 ImageBitmap 资源
    imageBitmap.close();

    // 转换为 Blob
    const compressedBlob = await canvas.convertToBlob({
      type: outputFormat,
      quality: quality
    });

    // 转换为 ArrayBuffer 以便传输
    const arrayBuffer = await compressedBlob.arrayBuffer();

    return {
      data: arrayBuffer,
      width: width,
      height: height,
      originalSize: bytes.length,
      compressedSize: arrayBuffer.byteLength,
      compressionRatio: (1 - arrayBuffer.byteLength / bytes.length).toFixed(2)
    };

  } catch (error) {
    throw new Error(`图片压缩失败: ${(error as Error).message}`);
  }

  // 计算压缩尺寸的辅助函数
  function calculateDimensions(originalWidth: number, originalHeight: number, maxWidth: number, maxHeight: number) {
    let width = originalWidth;
    let height = originalHeight;

    // 按比例缩放
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }

    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }

    return { width: Math.round(width), height: Math.round(height) };
  }
});
