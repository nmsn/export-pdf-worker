// 图片 URL 转 ImageBitmap，支持压缩
async function urlToImageBitmap(url, maxWidth, maxHeight, sendLog) {
  try {
    const startTime = performance.now();
    sendLog(`[图片压缩] 开始处理图片: ${url}, 最大尺寸: ${maxWidth}x${maxHeight}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const originalBitmap = await createImageBitmap(blob);

    sendLog(`[图片压缩] 原始图片尺寸: ${originalBitmap.width}x${originalBitmap.height}`);

    // 计算压缩后的尺寸，保持比例
    let newWidth = originalBitmap.width;
    let newHeight = originalBitmap.height;

    // 如果图片宽度超过最大宽度，按比例缩放
    if (originalBitmap.width > maxWidth) {
      const ratio = maxWidth / originalBitmap.width;
      newWidth = maxWidth;
      newHeight = Math.round(originalBitmap.height * ratio);
    }

    // 如果缩放后的高度仍然超过最大高度，再次按比例缩放
    if (newHeight > maxHeight) {
      const ratio = maxHeight / newHeight;
      newHeight = maxHeight;
      newWidth = Math.round(newWidth * ratio);
    }

    // 如果需要压缩
    if (newWidth !== originalBitmap.width || newHeight !== originalBitmap.height) {
      sendLog(`[图片压缩] 压缩后尺寸: ${newWidth}x${newHeight}`);

      // 创建 canvas 进行压缩
      const canvas = new OffscreenCanvas(newWidth, newHeight);
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('无法获取 canvas 2D 上下文');
      }

      // 绘制压缩后的图片
      ctx.drawImage(originalBitmap, 0, 0, newWidth, newHeight);

      // 创建新的 ImageBitmap
      const compressedBitmap = await createImageBitmap(canvas);

      // 清理原始 bitmap
      originalBitmap.close();

      const compressionEndTime = performance.now();
      const compressionTime = compressionEndTime - startTime;
      sendLog(`[图片压缩] 压缩完成，最终尺寸: ${compressedBitmap.width}x${compressedBitmap.height}`);
      sendLog(`[图片压缩] 压缩耗时: ${compressionTime.toFixed(2)}ms`);
      return compressedBitmap;
    } else {
      const noCompressionEndTime = performance.now();
      const noCompressionTime = noCompressionEndTime - startTime;
      sendLog(`[图片压缩] 图片尺寸已在限制范围内，无需压缩`);
      sendLog(`[图片压缩] 处理耗时: ${noCompressionTime.toFixed(2)}ms`);
      return originalBitmap;
    }
  } catch (error) {
    const errorTime = performance.now();
    sendLog(`[图片压缩] 处理图片时出错: ${error}`);
    sendLog(`[图片压缩] 错误发生时间: ${errorTime.toFixed(2)}ms`);
    throw error;
  }
}

// Worker 消息处理
self.onmessage = async (e) => {
  const workerStartTime = performance.now();

  // 日志发送函数
  const sendLog = (message) => {
    self.postMessage({
      type: 'log',
      message: message
    });
  };

  try {
    const { type, imageUrl, maxWidth, maxHeight, imageType } = e.data;

    if (type !== 'compress') {
      throw new Error('未知的消息类型');
    }

    if (typeof imageUrl !== 'string') {
      throw new Error('无效的图片 URL');
    }

    if (typeof maxWidth !== 'number' || typeof maxHeight !== 'number' ||
        maxWidth <= 0 || maxHeight <= 0) {
      throw new Error('无效的最大宽度或高度参数');
    }

    const imageTypeName = imageType === 'local' ? '本地图片' : 'URL图片';
    sendLog(`[图片压缩] 收到压缩请求: ${imageTypeName} - ${imageUrl.substring(0, 100)}..., 最大尺寸: ${maxWidth}x${maxHeight}`);

    // 记录压缩开始时间
    const compressionStartTime = performance.now();

    const compressedBitmap = await urlToImageBitmap(imageUrl, maxWidth, maxHeight, sendLog);

    // 记录压缩完成时间
    const compressionEndTime = performance.now();
    const compressionTime = compressionEndTime - compressionStartTime;

    const workerEndTime = performance.now();
    const workerTotalTime = workerEndTime - workerStartTime;

    sendLog(`[图片压缩] ${imageTypeName} 压缩耗时: ${compressionTime.toFixed(2)}ms`);
    sendLog(`[图片压缩] ${imageTypeName} Worker 总耗时: ${workerTotalTime.toFixed(2)}ms`);
    sendLog(`[图片压缩] ${imageTypeName} Worker 开销时间: ${(workerTotalTime - compressionTime).toFixed(2)}ms`);

    // 返回压缩后的 ImageBitmap
    self.postMessage({
      type: 'compressed',
      result: compressedBitmap,
      imageType: imageType
    }, [compressedBitmap]); // 使用 Transferable Objects 进行零拷贝传输

  } catch (error) {
    const workerErrorTime = performance.now();
    const workerErrorTotalTime = workerErrorTime - workerStartTime;
    sendLog(`[图片压缩] Worker 错误: ${error}`);
    sendLog(`[图片压缩] Worker 错误总耗时: ${workerErrorTotalTime.toFixed(2)}ms`);
    self.postMessage({
      type: 'error',
      error: error.message
    });
  }
};
