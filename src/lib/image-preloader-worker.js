// image-preloader-worker.js
importScripts('https://cdn.jsdelivr.net/npm/comlink/dist/umd/comlink.min.js');

const imageProcessor = {
  async processImage(url) {
    try {
      // 处理相对路径
      let absoluteUrl = url;
      if (url.startsWith('/')) {
        absoluteUrl = self.location.origin + url;
      }
      
      const response = await fetch(absoluteUrl);
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const bitmap = await createImageBitmap(blob);

      // 统一转成 JPEG Uint8Array
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      
      const jpegBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.85
      });

      const uint8 = new Uint8Array(await jpegBlob.arrayBuffer());
      return uint8;
    } catch (error) {
      throw new Error(`图片处理失败: ${error}`);
    }
  },
  
  async batchProcessImages(urls) {
    const results = [];
    for (const url of urls) {
      try {
        const result = await this.processImage(url);
        results.push(result);
      } catch (error) {
        console.error(`处理图片失败 ${url}:`, error);
        // 返回空的 Uint8Array 作为占位符
        results.push(new Uint8Array(0));
      }
    }
    return results;
  }
};

Comlink.expose(imageProcessor);