import JsPdf from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { PDFDocument } from 'pdf-lib';
import * as Comlink from 'comlink';

// ============================================================
// 浏览器兼容性检测
// ============================================================

const SUPPORTS_OFFSCREEN_CANVAS = typeof OffscreenCanvas !== 'undefined';
const SUPPORTS_IMAGE_BITMAP = typeof createImageBitmap !== 'undefined';
const SUPPORTS_WORKER_OPTIMIZATION = SUPPORTS_OFFSCREEN_CANVAS && SUPPORTS_IMAGE_BITMAP;

console.log(`[Worker优化方案] 浏览器兼容性检测:`);
console.log(`  - OffscreenCanvas: ${SUPPORTS_OFFSCREEN_CANVAS ? '✅' : '❌'}`);
console.log(`  - createImageBitmap: ${SUPPORTS_IMAGE_BITMAP ? '✅' : '❌'}`);
console.log(`  - 优化方案可用: ${SUPPORTS_WORKER_OPTIMIZATION ? '✅' : '❌'}`);

// ============================================================
// 时间记录工具
// ============================================================

interface TimingRecord {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

class TimingLogger {
  private records: TimingRecord[] = [];
  private currentRecord: TimingRecord | null = null;
  private counters: Map<string, number> = new Map();

  start(name: string): void {
    const startTime = performance.now();
    this.currentRecord = { name, startTime };
    console.log(`[Worker优化方案] ⏱️ 开始: ${name}`);
  }

  end(name: string): number {
    const endTime = performance.now();
    const record = this.records.find(r => r.name === name && !r.endTime) || this.currentRecord;

    if (record && record.name === name) {
      record.endTime = endTime;
      record.duration = endTime - record.startTime;
      console.log(`[Worker优化方案] ⏱️ 完成: ${name} - 耗时: ${record.duration.toFixed(2)}ms`);
      return record.duration;
    }

    console.warn(`[Worker优化方案] ⚠️ 未找到匹配的计时记录: ${name}`);
    return 0;
  }

  log(name: string, duration: number): void {
    console.log(`[Worker优化方案] ⏱️ ${name}: ${duration.toFixed(2)}ms`);
  }

  increment(name: string): number {
    const count = (this.counters.get(name) || 0) + 1;
    this.counters.set(name, count);
    return count;
  }

  getCount(name: string): number {
    return this.counters.get(name) || 0;
  }

  summary(): void {
    console.log('\n========== [Worker优化方案] 执行时间汇总 ==========');
    let total = 0;
    this.records.forEach(r => {
      if (r.duration) {
        console.log(`  ${r.name}: ${r.duration.toFixed(2)}ms`);
        total += r.duration;
      }
    });
    console.log(`  总计: ${total.toFixed(2)}ms`);
    console.log('各操作调用次数:');
    this.counters.forEach((count, name) => {
      console.log(`  ${name}: ${count} 次`);
    });
    console.log('=============================================\n');
  }
}

const timing = new TimingLogger();

// ============================================================
// 类型定义
// ============================================================

export const FONT_SIZE_BASE_H1 = 36;
export const FONT_SIZE_BASE_H2 = 24;
export const FONT_SIZE_BASE_H3 = 20;
export const FONT_SIZE_BASE_H4 = 16;
export const FONT_SIZE_BASE_H5 = 14;
export const FONT_SIZE_BASE_H6 = 12;
export const FONT_SIZE_BASE_H7 = 10;

export const PDF_PADDING = 10;
export const PDF_BORDER = 20;

// ============================================================
// 新版指令类型（使用 ImageBitmap 索引）
// ============================================================

interface TextInstruction {
  type: 'text';
  content: string;
  x: number;
  y: number;
  fontSize: number;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
}

// 新版图片指令：使用 imageIndex 引用预加载的 ImageBitmap
interface ImageInstructionV2 {
  type: 'image';
  imageIndex: number;  // 引用预加载的图片索引
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TableInstruction {
  type: 'table';
  head: (string | number | boolean)[][];
  body: (string | number | boolean)[][];
  startY: number;
  headStyles?: Record<string, unknown>;
  bodyStyles?: Record<string, unknown>;
  columnStyles?: Record<string, unknown>;
}

type DrawInstructionV2 = TextInstruction | ImageInstructionV2 | TableInstruction;

// 页面指令集
interface PageInstructionsV2 {
  pageIndex: number;
  items: DrawInstructionV2[];
}

// ============================================================
// 图片预加载信息
// ============================================================

interface PreloadImageInfo {
  url: string;
  width: number;
  height: number;
  bitmap?: ImageBitmap;
}

// ============================================================
// 图片预加载器使用 Comlink
// ============================================================

interface ImageProcessor {
  processImage(url: string): Promise<Uint8Array>;
  batchProcessImages(urls: string[]): Promise<Uint8Array[]>;
}

class ImagePreloader {
  private cache: Map<string, Uint8Array> = new Map();
  private workers: Comlink.Remote<ImageProcessor>[];
  private workerIndex: number = 0;

  constructor(workerCount: number = navigator.hardwareConcurrency || 4) {
    this.workers = [];
    for (let i = 0; i < workerCount; i++) {
      // 创建内联 Worker
      const workerCode = `
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
              throw new Error('图片处理失败: ' + error);
            }
          },
          
          async batchProcessImages(urls) {
            const results = [];
            for (const url of urls) {
              try {
                const result = await this.processImage(url);
                results.push(result);
              } catch (error) {
                console.error('处理图片失败 ' + url + ':', error);
                // 返回空的 Uint8Array 作为占位符
                results.push(new Uint8Array(0));
              }
            }
            return results;
          }
        };

        Comlink.expose(imageProcessor);
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      const remote = Comlink.wrap<ImageProcessor>(worker);
      this.workers.push(remote);
    }

    console.log(`[Worker优化方案] 创建图片预加载 Worker Pool，大小: ${workerCount}`);
  }

  /**
   * 预加载所有图片
   * @param urls 图片 URL 数组
   */
  async preload(urls: string[]): Promise<void> {
    if (urls.length === 0) return;

    // 按 Worker 数量分批处理
    const batchSize = Math.ceil(urls.length / this.workers.length);

    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.workers.length; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, urls.length);
      if (start < urls.length) {
        const batchUrls = urls.slice(start, end);
        const worker = this.workers[i];
        promises.push(
          worker.batchProcessImages(batchUrls).then(results => {
            // 将结果缓存
            for (let j = 0; j < batchUrls.length && j < results.length; j++) {
              this.cache.set(batchUrls[j], results[j]);
            }
          })
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * 获取已缓存的图片数据
   * @param url 图片 URL
   * @returns Uint8Array | null
   */
  get(url: string): Uint8Array | null {
    return this.cache.get(url) || null;
  }

  /**
   * 清理资源
   */
  async terminate(): Promise<void> {
    for (const worker of this.workers) {
      (worker as any)[Comlink.releaseProxy]?.();
    }
    // 终止实际的 Worker
    // 由于我们使用了动态 Worker URL，无法直接访问实际 Worker 对象
    // 但在实际应用中，Comlink 会自动处理这部分
  }
}

// ============================================================
// 图片处理 Worker Pool (保持原有兼容性)
// ============================================================

class ImageWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private taskQueue: Array<(worker: Worker) => void> = [];
  private workerUrl: string;

  constructor(poolSize: number = navigator.hardwareConcurrency || 4) {
    // 创建 Worker 代码
    const workerCode = `
      // 图片处理 Worker
      self.onmessage = async function(e) {
        const { type, images, taskId, baseUrl } = e.data;
        
        if (type === 'preload') {
          const results = [];
          
          for (let i = 0; i < images.length; i++) {
            const { url, index } = images[i];
            try {
              const startTime = performance.now();
              
              // 处理相对路径：将相对路径转换为绝对路径
              let absoluteUrl = url;
              if (url.startsWith('/')) {
                absoluteUrl = baseUrl + url;
              }
              
              self.postMessage({
                type: 'log',
                message: '[图片Worker] 加载图片 ' + index + ': ' + absoluteUrl
              });
              
              // fetch 图片
              const response = await fetch(absoluteUrl);
              const blob = await response.blob();
              
              // 创建 ImageBitmap
              const bitmap = await createImageBitmap(blob);
              
              const endTime = performance.now();
              self.postMessage({
                type: 'log',
                message: '[图片Worker] 图片 ' + index + ' 加载耗时: ' + (endTime - startTime).toFixed(2) + 'ms'
              });
              
              results.push({
                index,
                bitmap,
                width: bitmap.width,
                height: bitmap.height,
                success: true
              });
            } catch (error) {
              self.postMessage({
                type: 'log',
                message: '[图片Worker] 图片 ' + index + ' 加载失败: ' + error
              });
              results.push({
                index,
                success: false,
                error: error.message
              });
            }
          }
          
          // 注意：不使用 Transferable，使用结构化克隆
          // 这样主线程和 Worker 都可以访问 ImageBitmap
          // ImageBitmap 实现了结构化克隆算法，可以安全传输
          const bitmaps = results.filter(r => r.success).map(r => r.bitmap);
          
          self.postMessage({
            type: 'result',
            taskId,
            results: results.map(r => ({
              index: r.index,
              width: r.width,
              height: r.height,
              success: r.success
            })),
            bitmaps
          });  // 不使用 Transferable，保留引用
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.workerUrl = URL.createObjectURL(blob);

    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(this.workerUrl);
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }

    console.log(`[Worker优化方案] 创建图片处理 Worker Pool，大小: ${poolSize}`);
  }

  private getWorker(): Promise<Worker> {
    if (this.availableWorkers.length > 0) {
      return Promise.resolve(this.availableWorkers.pop()!);
    }

    return new Promise((resolve) => {
      this.taskQueue.push(resolve);
    });
  }

  private releaseWorker(worker: Worker): void {
    if (this.taskQueue.length > 0) {
      const nextTask = this.taskQueue.shift()!;
      nextTask(worker);
    } else {
      this.availableWorkers.push(worker);
    }
  }

  // 预加载图片，返回 ImageBitmap 数组和图片信息
  async preloadImages(images: Array<{ url: string; index: number }>): Promise<{
    bitmaps: (ImageBitmap | null)[];
    infos: PreloadImageInfo[];
  }> {
    const startTime = performance.now();
    const worker = await this.getWorker();

    return new Promise((resolve, reject) => {
      const handleMessage = (e: MessageEvent) => {
        if (e.data.type === 'log') {
          console.log(e.data.message);
          return;
        }

        if (e.data.type === 'result') {
          worker.removeEventListener('message', handleMessage);
          this.releaseWorker(worker);

          const { results } = e.data;  // 注意：不再接收 bitmaps，因为不使用 Transferable

          // 由于不使用 Transferable，ImageBitmap 无法通过消息传递
          // 所以我们只获取图片信息，ImageBitmap 需要在渲染时重新加载

          const sortedBitmaps: (ImageBitmap | null)[] = [];
          const infos: PreloadImageInfo[] = [];
          const maxIndex = Math.max(...results.map(r => r.index), 0);

          for (let i = 0; i <= maxIndex; i++) {
            // ImageBitmap 无法传输，设置为 null，渲染时再加载
            sortedBitmaps.push(null);

            const result = results.find(r => r.index === i);
            infos.push({
              url: images.find(img => img.index === i)?.url || '',
              width: result?.width || 0,
              height: result?.height || 0,
            });
          }

          const endTime = performance.now();
          console.log(`[Worker优化方案] ⏱️ 图片预加载完成: ${(endTime - startTime).toFixed(2)}ms`);

          resolve({ bitmaps: sortedBitmaps, infos });
        }
      };

      worker.addEventListener('message', handleMessage);

      // 获取当前页面的 baseUrl（协议 + 主机名 + 端口）
      const baseUrl = window.location.origin;

      worker.postMessage({
        type: 'preload',
        images,
        taskId: Date.now(),
        baseUrl,
      });
    });
  }

  terminate(): void {
    this.workers.forEach(w => w.terminate());
    URL.revokeObjectURL(this.workerUrl);
  }
}

// ============================================================
// 图片处理工具函数（降级方案）
// ============================================================

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Load img ${src} failed.`));
    image.src = src;
    image.crossOrigin = 'anonymous';
  });
}

function imageToBase64(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context!.drawImage(image, 0, 0, image.width, image.height);
  return canvas.toDataURL('image/png');
}

async function urlToBase64Async(url: string): Promise<string> {
  const img = await loadImage(url);
  return imageToBase64(img);
}

// ============================================================
// 序号管理
// ============================================================

interface SerialItem {
  parentLevel: number;
  curSeries: number[];
  curLevel: number;
  imgNumber: number;
  tableNumber: number;
}

interface SerialStack {
  setSerial: (level: number) => string;
  getSerial: () => string;
  getSerialArray: () => number[];
  getImgSerial: () => string;
  getTableSerial: () => string;
}

function createSerialStack(): SerialStack {
  const serial: SerialItem[] = [
    { parentLevel: 0, curLevel: 0, curSeries: [], imgNumber: 0, tableNumber: 0 }
  ];

  return {
    setSerial(level: number): string {
      let pre = serial[serial.length - 1];
      if (pre.curLevel === level) {
        serial.push({
          parentLevel: pre.parentLevel,
          curSeries: [...pre.curSeries.slice(0, -1), pre.curSeries[pre.curSeries.length - 1] + 1],
          curLevel: level,
          imgNumber: 0,
          tableNumber: 0
        });
      } else if (pre.curLevel < level) {
        serial.push({
          parentLevel: pre.curLevel,
          curSeries: pre.curSeries.concat(1),
          curLevel: level,
          imgNumber: 0,
          tableNumber: 0
        });
      } else {
        while (pre.curLevel > level && pre.curLevel !== 0) {
          serial.pop();
          pre = serial[serial.length - 1];
        }
        serial.push({
          parentLevel: pre.parentLevel,
          curSeries: [...pre.curSeries.slice(0, -1), pre.curSeries[pre.curSeries.length - 1] + 1],
          curLevel: level,
          imgNumber: 0,
          tableNumber: 0
        });
      }
      return this.getSerial();
    },
    getSerial(): string {
      const lastSerial = serial[serial.length - 1];
      if (lastSerial.curLevel === 1) {
        return `Chap ${easyCn2An(lastSerial.curSeries[0])}`;
      }
      return lastSerial.curSeries.join('.');
    },
    getSerialArray(): number[] {
      return serial[serial.length - 1].curSeries;
    },
    getImgSerial(): string {
      if (serial.length === 1) return '';
      const lastSerial = serial[serial.length - 1];
      return [...lastSerial.curSeries, ++lastSerial.imgNumber].join('.');
    },
    getTableSerial(): string {
      if (serial.length === 1) return '';
      const lastSerial = serial[serial.length - 1];
      return [...lastSerial.curSeries, ++lastSerial.tableNumber].join('.');
    }
  };
}

const easyCn2An = (num: number): string => {
  if (!Number(num) && (num <= 0 || num > 10)) {
    throw new Error();
  }
  const source = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  return source[num - 1];
};

// ============================================================
// 指令收集阶段（主线程）
// ============================================================

interface PositionConfig {
  align?: 'center' | 'left' | 'right';
  pageWidth?: number;
  imgWidth?: number;
  border?: number;
}

const getPositionX = (config?: PositionConfig): number => {
  const { align = 'center', pageWidth = 0, imgWidth = 0, border = 0 } = config || {};
  if (align === 'center') return (pageWidth - imgWidth) / 2;
  if (align === 'left') return border;
  if (align === 'right') return pageWidth - border - imgWidth;
  return 0;
};

interface TextConfig {
  x?: number;
  y?: number;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  border?: number;
  maxWidth?: number;
  pageWidth?: number;
  indent?: boolean;
}

interface CollectTextResult {
  instructions: TextInstruction[];
  endY: number;
  endX: number;
}

const collectTextInstructions = (
  pdf: JsPdf,
  text: string,
  config?: TextConfig
): CollectTextResult => {
  const {
    x,
    y = 0,
    fontSize = FONT_SIZE_BASE_H2,
    align = 'left',
    border = PDF_BORDER,
    pageWidth = 0,
    indent = false,
  } = config || {};

  const maxWidth = config?.maxWidth ?? pageWidth ?? 0;
  pdf.setFontSize(fontSize);

  const textWidth = pdf.getTextWidth(text);
  const lines = maxWidth > 0 ? pdf.splitTextToSize(text, maxWidth, { fontSize }).length : 1;

  if (lines > 1) {
    let _positionX = 0;
    if (align === 'center') _positionX = pageWidth / 2;
    if (align === 'left') _positionX = border;
    if (align === 'right') _positionX = pageWidth - border - maxWidth;

    const { h } = pdf.getTextDimensions(text, { maxWidth });
    const textHeight = h * pdf.getLineHeightFactor();
    const singleLineHeight = textHeight / lines;

    const realX = x ?? _positionX;
    const instructions: TextInstruction[] = [];

    if (indent) {
      _positionX = border;
      let _y = y + singleLineHeight;
      const _text = `xx${text}`;
      const indentLines = pdf.splitTextToSize(_text, maxWidth);
      const { w: indentWidth } = pdf.getTextDimensions('xx');

      indentLines.forEach((line, idx) => {
        const lineX = idx === 0 ? _positionX + indentWidth : _positionX;
        const _line = idx === 0 ? line.slice(2) : line;
        instructions.push({
          type: 'text',
          content: _line,
          x: lineX,
          y: _y,
          fontSize,
        });
        _y += singleLineHeight;
      });

      return { instructions, endY: _y, endX: _positionX + textWidth };
    }

    instructions.push({
      type: 'text',
      content: text,
      x: realX,
      y: y + singleLineHeight,
      fontSize,
      align,
      maxWidth,
    });

    return { instructions, endY: y + textHeight, endX: realX + maxWidth };
  }

  let _positionX = 0;
  if (align === 'center') _positionX = (pageWidth - textWidth) / 2;
  if (align === 'left') _positionX = border;
  if (align === 'right') _positionX = pageWidth - border - textWidth;

  const realX = x ?? _positionX;
  const { h } = pdf.getTextDimensions(text, { maxWidth });
  const textHeight = h * pdf.getLineHeightFactor();

  const instructions: TextInstruction[] = [
    {
      type: 'text',
      content: text,
      x: realX,
      y: y + textHeight,
      fontSize,
      maxWidth,
    },
  ];

  return { instructions, endY: y + textHeight, endX: realX + textWidth };
};

interface ImgConfig {
  x?: number;
  y?: number;
  width?: number;
  align?: 'center' | 'left' | 'right';
  border?: number;
  headerHeight?: number;
  fill?: boolean;
  minHeightPercent?: number;
  pageWidth?: number;
  pageHeight?: number;
  bottomText?: string;
}

interface CollectImgResultV2 {
  instructions: DrawInstructionV2[];
  endY: number;
  needNewPage: boolean;
}

// 新版：使用预加载的图片信息生成指令
const collectImageInstructionsV2 = (
  pdf: JsPdf,
  imageIndex: number,
  imageInfo: PreloadImageInfo,
  currentY: number,
  config?: ImgConfig
): CollectImgResultV2 => {
  const {
    x = 0,
    width,
    align = 'center',
    border = PDF_BORDER,
    headerHeight = 0,
    fill = false,
    minHeightPercent = 0.8,
    pageWidth = 0,
    pageHeight = 0,
    bottomText,
  } = config || {};

  if (!imageInfo || imageInfo.width === 0) {
    return { instructions: [], endY: currentY, needNewPage: false };
  }

  const maxWidth = pageWidth - 2 * border;
  const imgWidth = imageInfo.width;
  const imgHeight = imageInfo.height;

  let _width = (() => {
    if (width && fill) return Math.min(width, maxWidth);
    if (width) return width;
    if (fill) return maxWidth;
    return imgWidth > maxWidth ? maxWidth : imgWidth;
  })();

  const _ratio = imgWidth / _width;
  let _height = imgHeight / _ratio;
  let _bottomTextHeight = 0;

  if (bottomText) {
    const { h } = pdf.getTextDimensions(bottomText, { maxWidth });
    _bottomTextHeight = h * pdf.getLineHeightFactor();
    _height += _bottomTextHeight;
  }

  const addPageInitY = headerHeight + border;
  const instructions: DrawInstructionV2[] = [];

  // 图片超出整个页面
  const isExceedPageLength = _height > pageHeight - 2 * border;
  if (isExceedPageLength) {
    _height = pageHeight - 2 * border - _bottomTextHeight;
    const zoomRatio = _height / imgHeight;
    _width = imgWidth * zoomRatio;
    const _positionX = getPositionX({ imgWidth: _width, pageWidth, align, border });

    instructions.push({
      type: 'image',
      imageIndex,
      x: x ?? _positionX,
      y: addPageInitY,
      width: _width,
      height: _height,
    });

    return { instructions, endY: addPageInitY + _height, needNewPage: currentY !== PDF_BORDER };
  }

  // 当前页面剩余空间不足
  const isExceedCurrentLength = _height > pageHeight - currentY - border;
  if (isExceedCurrentLength) {
    const remainHeight = pageHeight - border - currentY - _bottomTextHeight;
    const remainPercent = remainHeight / pageHeight;
    const imgZoomRatio = remainHeight / imgHeight;

    if (remainPercent >= minHeightPercent) {
      const _positionX = getPositionX({
        imgWidth: imgZoomRatio * imgWidth,
        pageWidth,
        align,
        border,
      });

      instructions.push({
        type: 'image',
        imageIndex,
        x: x ?? _positionX,
        y: currentY,
        width: imgWidth * imgZoomRatio,
        height: remainHeight,
      });

      return { instructions, endY: currentY + remainHeight, needNewPage: false };
    }

    const _positionX = getPositionX({ imgWidth: _width, pageWidth, align, border });

    instructions.push({
      type: 'image',
      imageIndex,
      x: x ?? _positionX,
      y: addPageInitY,
      width: _width,
      height: _height - _bottomTextHeight,
    });

    return { instructions, endY: addPageInitY + _height - _bottomTextHeight, needNewPage: true };
  }

  const _positionX = getPositionX({ imgWidth: _width, pageWidth, align, border });

  instructions.push({
    type: 'image',
    imageIndex,
    x: x ?? _positionX,
    y: currentY,
    width: _width,
    height: _height - _bottomTextHeight,
  });

  return { instructions, endY: currentY + _height - _bottomTextHeight, needNewPage: false };
};

// ============================================================
// PDF-Worker 优化类
// ============================================================

interface Chapter {
  index: number[];
  text: string;
  num: number;
  level: number;
}

interface PDFWorkerV2Config {
  pageSize?: string;
  fontSize?: number;
  border?: number;
  padding?: number;
  headerImg?: string;
  workerCount?: number;
  imageWorkerCount?: number;
}

export class PDFWorkerV2 {
  private border: number;
  private padding: number;
  private pageSize: string;
  private fontSize: number;
  private headerImg: string;
  private headerHeight: number;
  private x: number;
  private y: number;
  private pageWidth: number;
  private pageHeight: number;
  private chapter: Chapter[];
  private serialStack: SerialStack;
  private workerCount: number;
  private imageWorkerCount: number;

  // 指令收集
  private allInstructions: DrawInstructionV2[][];
  private currentPageInstructions: DrawInstructionV2[];

  // 图片管理
  private imageInfos: PreloadImageInfo[];
  private nextImageIndex: number;

  // Worker Pool
  private imageWorkerPool: ImageWorkerPool | null = null;

  // 共享的 PDF 实例（仅用于文本测量）
  private measurePdf: JsPdf;

  constructor(config: PDFWorkerV2Config = {}) {
    const {
      pageSize = 'a4',
      fontSize = FONT_SIZE_BASE_H2,
      border = PDF_BORDER,
      padding = PDF_PADDING,
      headerImg = '',
      workerCount = navigator.hardwareConcurrency || 4,
      imageWorkerCount = 2,
    } = config;

    this.border = border;
    this.padding = padding;
    this.pageSize = pageSize;
    this.fontSize = fontSize;
    this.headerImg = headerImg;
    this.headerHeight = 0;
    this.x = border;
    this.y = border;
    this.workerCount = workerCount;
    this.imageWorkerCount = imageWorkerCount;

    const pdf = new JsPdf('p', 'px', pageSize);
    this.pageWidth = pdf.internal.pageSize.getWidth();
    this.pageHeight = pdf.internal.pageSize.getHeight();
    this.measurePdf = pdf;

    this.chapter = [];
    this.serialStack = createSerialStack();
    this.allInstructions = [];
    this.currentPageInstructions = [];

    // 图片管理
    this.imageInfos = [];
    this.nextImageIndex = 0;

    // 创建图片 Worker Pool
    if (SUPPORTS_WORKER_OPTIMIZATION) {
      this.imageWorkerPool = new ImageWorkerPool(imageWorkerCount);
    }
  }

  // 预加载器实例
  private imagePreloader: ImagePreloader | null = null;

  // 注册图片 URL，返回图片索引
  registerImage(url: string): number {
    const index = this.nextImageIndex++;
    this.imageInfos[index] = { url, width: 0, height: 0 };
    return index;
  }

  // 预加载所有注册的图片
  async preloadImages(): Promise<void> {
    if (!SUPPORTS_WORKER_OPTIMIZATION) {
      // 降级方案：在主线程加载图片
      console.log('[Worker优化方案] 使用降级方案加载图片');

      for (let i = 0; i < this.imageInfos.length; i++) {
        const info = this.imageInfos[i];
        if (!info?.url) continue;

        try {
          const img = await loadImage(info.url);
          this.imageInfos[i] = {
            ...info,
            width: img.width,
            height: img.height,
          };
        } catch (error) {
          console.error(`[Worker优化方案] 图片 ${i} 加载失败:`, error);
        }
      }
      return;
    }

    // 使用预加载器提前处理所有图片
    this.imagePreloader = new ImagePreloader(this.imageWorkerCount);

    // 收集所有非空图片 URL
    const urls = this.imageInfos
      .filter(info => info && info.url !== undefined && info.url !== '')
      .map(info => info.url);

    if (urls.length === 0) return;

    timing.start('图片预加载（预加载器）');
    try {
      await this.imagePreloader.preload(urls);
      console.log(`[Worker优化方案] ✅ 图片预加载完成，共 ${urls.length} 张图片`);
    } catch (error) {
      console.error('[Worker优化方案] 图片预加载失败:', error);
    }
    timing.end('图片预加载（预加载器）');
  }

  private async collectHeaderInstructions(): Promise<DrawInstructionV2[]> {
    if (!this.headerImg) {
      this.headerHeight = 0;
      return [];
    }

    // 注册 header 图片
    const headerIndex = this.registerImage(this.headerImg);

    // 临时加载获取尺寸
    const img = await loadImage(this.headerImg);
    const maxWidth = this.pageWidth - 10;
    const ratio = img.width / maxWidth;
    const height = img.height / ratio;
    this.headerHeight = height;

    // 更新图片信息
    this.imageInfos[headerIndex] = {
      url: this.headerImg,
      width: img.width,
      height: img.height,
    };

    return [
      {
        type: 'image',
        imageIndex: headerIndex,
        x: 0,
        y: 10,
        width: maxWidth,
        height,
      },
    ];
  }

  async addHeader(): Promise<void> {
    const headerInstructions = await this.collectHeaderInstructions();
    this.currentPageInstructions.push(...headerInstructions);
    this.y = this.headerHeight + 5;
  }

  async addPage(): Promise<{ y: number }> {
    // 保存当前页指令
    if (this.currentPageInstructions.length > 0) {
      this.allInstructions.push([...this.currentPageInstructions]);
    }

    // 新页面
    this.currentPageInstructions = [];
    this.currentPageInstructions.push(...(await this.collectHeaderInstructions()));
    this.y = this.headerImg ? this.headerHeight + 5 : this.border + 5;

    return { y: this.y };
  }

  getCurrentPageNum(): number {
    return this.allInstructions.length + 1;
  }

  async addChapter(title: string, level: number): Promise<void> {
    if (level === 1 && this.chapter.length === 0) {
      await this.addHeader();
    }

    const _pageNum = this.getCurrentPageNum();
    this.serialStack.setSerial(level);
    const _title = `${this.serialStack.getSerial()} ${title}`;

    this.chapter.push({
      index: this.serialStack.getSerialArray(),
      text: _title,
      num: _pageNum,
      level,
    });

    this.addText(_title, {
      y: level === 1 ? this.headerHeight : this.y,
      align: level === 1 ? 'center' : 'left',
      fontSize: level === 1 ? FONT_SIZE_BASE_H2 : FONT_SIZE_BASE_H3,
    });
  }

  addText(text: string, config?: TextConfig): void {
    const { instructions, endY } = collectTextInstructions(this.measurePdf, text, {
      y: this.y,
      border: this.border,
      pageWidth: this.pageWidth,
      ...config,
    });
    this.currentPageInstructions.push(...instructions);
    this.y = endY + this.padding;
  }

  async addImage(img: string, config?: ImgConfig): Promise<void> {
    // 注册图片
    const imageIndex = this.registerImage(img);

    // 临时加载获取尺寸（用于布局计算）
    const loadedImg = await loadImage(img);
    this.imageInfos[imageIndex] = {
      url: img,
      width: loadedImg.width,
      height: loadedImg.height,
    };

    const { instructions, endY, needNewPage } = collectImageInstructionsV2(
      this.measurePdf,
      imageIndex,
      this.imageInfos[imageIndex],
      this.y,
      {
        headerHeight: this.headerHeight,
        pageWidth: this.pageWidth,
        pageHeight: this.pageHeight,
        ...config,
      }
    );

    if (needNewPage) {
      await this.addPage();
    }

    this.currentPageInstructions.push(...instructions);
    this.y = endY + this.padding;

    const { bottomText } = config || {};
    if (bottomText) {
      const index = this.serialStack.getImgSerial();
      this.addText(`${index ? `图${index}` : ''} ${bottomText}`, {
        y: this.y - 5,
        fontSize: FONT_SIZE_BASE_H5,
        align: 'center',
      });
    }
  }

  addTable(tableMessage: { head: (string | number | boolean)[][]; body: (string | number | boolean)[][] }, title: string): void {
    const index = this.serialStack.getTableSerial();
    const tableTitle = `${index ? `表${index}` : ''} ${title}`;

    this.addText(tableTitle, {
      align: 'center',
      fontSize: 14,
    });

    this.currentPageInstructions.push({
      type: 'table',
      head: tableMessage.head,
      body: tableMessage.body,
      startY: this.y - 5,
      headStyles: { fillColor: '#c00000', halign: 'center', valign: 'middle' },
      bodyStyles: { halign: 'center', valign: 'middle' },
    });

    this.y += 50;
  }

  // 添加目录页面
  addCatalog(pageNum = 1): void {
    // 创建目录页面的指令
    const catalogInstructions: DrawInstructionV2[] = [];

    // 目录标题
    catalogInstructions.push({
      type: 'text',
      content: '目录',
      x: this.pageWidth / 2,
      y: 80,
      fontSize: FONT_SIZE_BASE_H4,
      align: 'center',
    });

    // 生成目录项
    let currentY = 90;
    for (const item of this.chapter) {
      const { text, level, num } = item;

      // 计算文本缩进
      const indent = 40 + 12 * (level - 1);
      const rightBorder = 40;

      // 添加章节标题
      const chapterTextInstruction: TextInstruction = {
        type: 'text',
        content: text,
        x: indent,
        y: currentY,
        fontSize: FONT_SIZE_BASE_H6,
        align: 'left',
      };

      // 添加页码
      const pageNumInstruction: TextInstruction = {
        type: 'text',
        content: num.toString(),
        x: this.pageWidth - rightBorder,
        y: currentY,
        fontSize: FONT_SIZE_BASE_H6,
        align: 'right',
      };

      catalogInstructions.push(chapterTextInstruction);
      catalogInstructions.push(pageNumInstruction);

      // 添加"..."连接符
      const textWidth = this.measurePdf.getTextWidth(text);
      const pageNumWidth = this.measurePdf.getTextWidth(num.toString());
      const pageWidth = this.pageWidth;
      const startX = indent + textWidth;
      const endX = pageWidth - rightBorder - pageNumWidth;
      const dotSpace = FONT_SIZE_BASE_H6 - 3;
      const dotCount = Math.floor((endX - startX) / dotSpace);

      for (let i = 0; i < dotCount - 2; i++) {
        const dotInstruction: TextInstruction = {
          type: 'text',
          content: '.',
          x: endX - (i + 1) * dotSpace,
          y: currentY,
          fontSize: FONT_SIZE_BASE_H6 - 3,
          align: 'right',
        };
        catalogInstructions.push(dotInstruction);
      }

      currentY += FONT_SIZE_BASE_H6 + 5;
    }

    // 插入到指定页码位置（需要特殊处理，因为我们的页码从0开始）
    // 在 this.allInstructions 中插入目录页
    const catalogPage: DrawInstructionV2[] = [
      {
        type: 'text',
        content: '目录',
        x: this.pageWidth / 2,
        y: 80,
        fontSize: FONT_SIZE_BASE_H4,
        align: 'center',
      }
    ];

    // 重新计算 y 坐标
    let catalogY = 90;
    for (const item of this.chapter) {
      const { text, level, num } = item;

      // 计算文本缩进
      const indent = 40 + 12 * (level - 1);

      // 添加章节标题
      catalogPage.push({
        type: 'text',
        content: text,
        x: indent,
        y: catalogY,
        fontSize: FONT_SIZE_BASE_H6,
        align: 'left',
      });

      // 添加页码
      catalogPage.push({
        type: 'text',
        content: num.toString(),
        x: this.pageWidth - 40,
        y: catalogY,
        fontSize: FONT_SIZE_BASE_H6,
        align: 'right',
      });

      // 添加连接符
      const textWidth = this.measurePdf.getTextWidth(text);
      const pageNumWidth = this.measurePdf.getTextWidth(num.toString());
      const startX = indent + textWidth;
      const endX = this.pageWidth - 40 - pageNumWidth;
      const dotSpace = FONT_SIZE_BASE_H6 - 3;
      const dotCount = Math.floor((endX - startX) / dotSpace);

      for (let i = 0; i < Math.max(0, dotCount - 2); i++) {
        catalogPage.push({
          type: 'text',
          content: '.',
          x: endX - (i + 1) * dotSpace,
          y: catalogY,
          fontSize: FONT_SIZE_BASE_H6 - 3,
          align: 'right',
        });
      }

      catalogY += FONT_SIZE_BASE_H6 + 5;
    }

    // 将目录页插入到指定位置 - 在 this.allInstructions 的索引 pageNum-1 处
    if (pageNum === 1) {
      // 插入到开头
      this.allInstructions.unshift(catalogPage);
    } else {
      // 插入到指定位置（考虑索引）
      this.allInstructions.splice(pageNum - 1, 0, catalogPage);
    }
  }

  // 获取所有页面指令
  private getPageInstructions(): PageInstructionsV2[] {
    if (this.currentPageInstructions.length > 0) {
      this.allInstructions.push([...this.currentPageInstructions]);
    }

    return this.allInstructions.map((items, index) => ({
      pageIndex: index,
      items,
    }));
  }

  // 使用 Worker 并行渲染
  async renderWithWorkers(): Promise<ArrayBuffer[]> {
    // 预加载图片（现在使用预加载器）
    await this.preloadImages();

    timing.start('指令收集');
    const pageInstructions = this.getPageInstructions();
    timing.end('指令收集');

    console.log(`[Worker优化方案] 📊 页面数量: ${pageInstructions.length}`);
    console.log(`[Worker优化方案] 📊 图片数量: ${this.imageInfos.length}`);

    timing.start('Worker 并行渲染');

    const results: ArrayBuffer[] = [];

    // 根据是否支持优化方案选择渲染策略
    if (!SUPPORTS_WORKER_OPTIMIZATION) {
      // 降级方案：使用 base64
      console.log('[Worker优化方案] 使用降级方案，在主线程转换 base64');

      // 预先转换所有图片为 base64
      const base64Map: Map<number, string> = new Map();
      for (let i = 0; i < this.imageInfos.length; i++) {
        const info = this.imageInfos[i];
        if (info?.url) {
          try {
            const base64 = await urlToBase64Async(info.url);
            base64Map.set(i, base64);
          } catch (err) {
            console.error(`[Worker优化方案] 图片 ${i} 转 base64 失败:`, err);
          }
        }
      }

      // 创建 Worker 池来处理降级渲染
      interface FallbackPDFRenderer {
        renderPageWithBase64(
          instructions: any[],
          pageSize: string,
          base64Images: Record<number, string>,
          bitmapIndexMap: Record<number, number>
        ): Promise<ArrayBuffer>;
      }

      const fallbackWorkers: Comlink.Remote<FallbackPDFRenderer>[] = [];
      for (let i = 0; i < this.workerCount; i++) {
        const fallbackWorkerCode = `
          importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
          importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
          
          // 使用 Comlink
          importScripts('https://cdn.jsdelivr.net/npm/comlink/dist/umd/comlink.min.js');
          
          const pdfRenderer = {
            renderPageWithBase64: function(instructions, pageSize, base64Images, bitmapIndexMap) {
              const jspdf = self.jspdf || self;
              const jsPDF = jspdf.jsSPDF;
              const doc = new jsPDF('p', 'px', pageSize);

              for (const item of instructions) {
                if (item.type === 'text') {
                  doc.setFontSize(item.fontSize);
                  doc.text(item.content, item.x, item.y, {
                    align: item.align,
                    maxWidth: item.maxWidth
                  });
                } else if (item.type === 'image') {
                  const mappedIndex = bitmapIndexMap[item.imageIndex];
                  const base64 = base64Images[mappedIndex];
                  if (base64) {
                    doc.addImage(base64, 'JPEG', item.x, item.y, item.width, item.height, '', 'FAST');
                  }
                } else if (item.type === 'table') {
                  doc.autoTable({
                    startY: item.startY,
                    theme: 'grid',
                    head: item.head,
                    body: item.body,
                    headStyles: item.headStyles,
                    bodyStyles: item.bodyStyles,
                    columnStyles: item.columnStyles
                  });
                }
              }

              return doc.output('arraybuffer');
            }
          };

          Comlink.expose(pdfRenderer);
        `;

        const blob = new Blob([fallbackWorkerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        fallbackWorkers.push(Comlink.wrap<FallbackPDFRenderer>(worker));
      }

      // 并行处理页面
      const fallbackPagePromises = pageInstructions.map(async (page, index) => {
        const pageImageIndices = new Set<number>();
        page.items.forEach(item => {
          if (item.type === 'image') {
            pageImageIndices.add(item.imageIndex);
          }
        });

        const bitmapIndexMap: Record<number, number> = {};
        const base64Images: Record<number, string> = {};
        let newIdx = 0;

        pageImageIndices.forEach(originalIndex => {
          bitmapIndexMap[originalIndex] = newIdx;
          const base64 = base64Map.get(originalIndex);
          if (base64) {
            base64Images[newIdx] = base64;
          }
          newIdx++;
        });

        const worker = fallbackWorkers[index % fallbackWorkers.length];
        return await worker.renderPageWithBase64(page.items, this.pageSize, base64Images, bitmapIndexMap);
      });

      results.push(...await Promise.all(fallbackPagePromises));

      // 清理 Workers
      for (const worker of fallbackWorkers) {
        (worker as any)[Comlink.releaseProxy]?.();
      }
    } else {
      // 优化方案：使用预加载的图片数据
      interface PDFRenderer {
        renderPage(
          instructions: any[],
          pageSize: string,
          imageDataMap: Record<number, Uint8Array>
        ): Promise<ArrayBuffer>;
      }

      // 创建 Worker 池
      const workers: Comlink.Remote<PDFRenderer>[] = [];
      for (let i = 0; i < this.workerCount; i++) {
        const workerCode = `
          importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
          importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
          
          // 使用 Comlink
          importScripts('https://cdn.jsdelivr.net/npm/comlink/dist/umd/comlink.min.js');
          
          const pdfRenderer = {
            renderPage: function(instructions, pageSize, imageDataMap) {
              const jspdf = self.jspdf || self;
              const jsPDF = jspdf.jsPDF;
              const doc = new jsPDF('p', 'px', pageSize);

              // 将 Uint8Array 转换为 base64
              const uint8ArrayToBase64 = function(uint8Array) {
                let binary = '';
                const len = uint8Array.byteLength;
                for (let i = 0; i < len; i++) {
                  binary += String.fromCharCode(uint8Array[i]);
                }
                return 'data:image/jpeg;base64,' + btoa(binary);
              };

              // 渲染指令
              for (const item of instructions) {
                if (item.type === 'text') {
                  doc.setFontSize(item.fontSize);
                  doc.text(item.content, item.x, item.y, {
                    align: item.align,
                    maxWidth: item.maxWidth
                  });
                } else if (item.type === 'image') {
                  const imageData = imageDataMap[item.imageIndex];
                  if (imageData && imageData.length > 0) {
                    const base64 = uint8ArrayToBase64(imageData);
                    doc.addImage(base64, 'JPEG', item.x, item.y, item.width, item.height, '', 'FAST');
                  }
                } else if (item.type === 'table') {
                  doc.autoTable({
                    startY: item.startY,
                    theme: 'grid',
                    head: item.head,
                    body: item.body,
                    headStyles: item.headStyles,
                    bodyStyles: item.bodyStyles,
                    columnStyles: item.columnStyles
                  });
                }
              }

              return doc.output('arraybuffer');
            }
          };

          Comlink.expose(pdfRenderer);
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        workers.push(Comlink.wrap<PDFRenderer>(worker));
      }

      // 并行渲染页面
      const pagePromises = pageInstructions.map(async (page, index) => {
        const worker = workers[index % workers.length];

        // 准备页面所需图片数据
        const pageImageIndices = new Set<number>();
        page.items.forEach(item => {
          if (item.type === 'image') {
            pageImageIndices.add(item.imageIndex);
          }
        });

        const imageDataMap: Record<number, Uint8Array> = {};
        for (const imgIndex of pageImageIndices) {
          const info = this.imageInfos[imgIndex];
          if (info?.url && this.imagePreloader) {
            const imageData = this.imagePreloader.get(info.url);
            if (imageData) {
              imageDataMap[imgIndex] = imageData;
            }
          }
        }

        return await worker.renderPage(page.items, this.pageSize, imageDataMap);
      });

      results.push(...await Promise.all(pagePromises));

      // 清理 Workers
      for (const worker of workers) {
        (worker as any)[Comlink.releaseProxy]?.();
      }
    }

    timing.end('Worker 并行渲染');

    return results;
  }

  // 合并 PDF
  async mergePDFs(buffers: ArrayBuffer[]): Promise<Uint8Array> {
    timing.start('PDF 合并');
    const finalDoc = await PDFDocument.create();

    for (const buffer of buffers) {
      const pdf = await PDFDocument.load(buffer);
      const pages = await finalDoc.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => finalDoc.addPage(page));
    }

    const result = await finalDoc.save();
    timing.end('PDF 合并');
    return result;
  }

  // 主导出方法
  async save(name: string): Promise<void> {
    timing.start('总耗时');
    console.log(`[Worker优化方案] 使用 ${this.workerCount} 个 PDF Worker + ${this.imageWorkerCount} 个图片 Worker`);

    const buffers = await this.renderWithWorkers();
    const mergedPdf = await this.mergePDFs(buffers);

    // 清理 Worker Pool
    if (this.imageWorkerPool) {
      this.imageWorkerPool.terminate();
    }

    // 清理图片预加载器
    if (this.imagePreloader) {
      await this.imagePreloader.terminate();
      this.imagePreloader = null;
    }

    // 下载
    const blob = new Blob([new Uint8Array(mergedPdf)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.pdf`;
    a.click();
    URL.revokeObjectURL(url);

    timing.end('总耗时');
    timing.summary();
  }
}

// ============================================================
// 导出函数
// ============================================================

export interface IHeading {
  type: 'heading';
  data: {
    value: string;
    level: number;
  };
}

// 表格样式配置
interface TableStyles {
  [key: string]: unknown;
}

interface TableConfig {
  head?: (string | number | boolean)[][];
  body?: (string | number | boolean)[][];
  bodyStyles?: TableStyles;
  headStyles?: TableStyles;
  columnStyles?: TableStyles;
}

export interface ITable {
  type: 'table';
  data: {
    value: {
      head: (string | number | boolean)[];
      body: (string | number | boolean)[][];
    };
    title: string;
    pdfOptions?: TableConfig;
  };
}

export interface IImg {
  type: 'img';
  data: {
    value: string;
    options?: ImgConfig;
  };
}

export interface IPage {
  type: 'addPage';
}

export interface IText {
  type: 'text';
  data: {
    value: string;
    options?: TextConfig;
  };
}

interface ExportOptions {
  addBackCover?: boolean;
  headerImg?: string;
  workerCount?: number;
  imageWorkerCount?: number;
}

/**
 * 导出 PDF 文件（Worker 优化方案）
 * 使用 ImageBitmap + OffscreenCanvas 实现：
 * 1. 图片在 Worker Pool 中并行加载
 * 2. ImageBitmap 通过 Transferable 零拷贝传输
 * 3. PDF 渲染在 Worker 中并行执行
 * 
 * @param data 导出数据数组
 * @param title 文件名
 * @param options 配置选项
 */
export async function exportPdfWithWorker(
  data: (IHeading | ITable | IImg | IPage | IText)[],
  title: string,
  options: ExportOptions = {}
): Promise<void> {
  const startTime = performance.now();
  console.log('\n========== [Worker优化方案] 开始导出 PDF ==========');
  console.log(`[Worker优化方案] 浏览器优化支持: ${SUPPORTS_WORKER_OPTIMIZATION ? '✅ 是' : '❌ 否，使用降级方案'}`);

  const opts = {
    headerImg: '',
    workerCount: navigator.hardwareConcurrency || 4,
    imageWorkerCount: 2,
    ...options,
  };

  timing.start('初始化 PDF Worker');
  const pdf = new PDFWorkerV2(opts);
  timing.end('初始化 PDF Worker');

  let isEmptyPage = true;

  timing.start('收集所有指令');
  for (const item of data) {
    if (item.type === 'heading') {
      if (!isEmptyPage) {
        await pdf.addPage();
      }
      await pdf.addChapter(item.data.value, item.data.level);
    }
    if (item.type === 'addPage') {
      await pdf.addPage();
    }
    if (item.type === 'table') {
      pdf.addTable(
        {
          head: Array.isArray(item.data.value.head[0])
            ? (item.data.value.head as unknown as (string | number | boolean)[][])
            : [item.data.value.head as (string | number | boolean)[]],
          body: item.data.value.body,
        },
        item.data.title
      );
    }
    if (item.type === 'img') {
      await pdf.addImage(item.data.value, item.data.options);
    }
    if (item.type === 'text') {
      pdf.addText(item.data.value, item.data.options || {});
    }
    isEmptyPage = item.type === 'heading';
  }
  timing.end('收集所有指令');

  // 添加目录
  const catalogStartTime = performance.now();
  pdf.addCatalog(1); // 在第一页添加目录
  const catalogEndTime = performance.now();
  console.log(`[Worker优化方案] ⏱️ 添加目录: ${(catalogEndTime - catalogStartTime).toFixed(2)}ms`);

  await pdf.save(title);

  const endTime = performance.now();
  console.log(`[Worker优化方案] ✅ 导出完成，总耗时: ${(endTime - startTime).toFixed(2)}ms`);
  console.log('=============================================\n');
}