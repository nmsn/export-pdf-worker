import { PDFDocument } from 'pdf-lib';
import * as Comlink from 'comlink';
import JsPdf from 'jspdf';
import {
  collectImageInstructionsV2,
  collectTextInstructions,
  createSerialStack,
  DrawInstructionV2,
  FONT_SIZE_BASE_H2,
  FONT_SIZE_BASE_H3,
  FONT_SIZE_BASE_H4,
  FONT_SIZE_BASE_H5,
  FONT_SIZE_BASE_H6,
  ImgConfig,
  loadImage,
  PDF_BORDER,
  PDF_PADDING,
  PreloadImageInfo,
  renderPdfInstructions,
  SerialStack,
  TableInstruction,
  TextConfig,
  TextInstruction,
  TimingLogger,
  uint8ArrayToBase64,
  urlToBase64Async,
} from './pdf-work-utils';
export {
  FONT_SIZE_BASE_H1,
  FONT_SIZE_BASE_H2,
  FONT_SIZE_BASE_H3,
  FONT_SIZE_BASE_H4,
  FONT_SIZE_BASE_H5,
  FONT_SIZE_BASE_H6,
  FONT_SIZE_BASE_H7,
  PDF_BORDER,
  PDF_PADDING,
} from './pdf-work-utils';

// ============================================================
// 浏览器兼容性检测
// ============================================================

interface WorkerOptimizationSupport {
  supportsOffscreenCanvas: boolean;
  supportsImageBitmap: boolean;
  supportsWorkerOptimization: boolean;
}

function getWorkerOptimizationSupport(): WorkerOptimizationSupport {
  const supportsOffscreenCanvas = typeof OffscreenCanvas !== 'undefined';
  const supportsImageBitmap = typeof createImageBitmap !== 'undefined';

  return {
    supportsOffscreenCanvas,
    supportsImageBitmap,
    supportsWorkerOptimization: supportsOffscreenCanvas && supportsImageBitmap,
  };
}

function logWorkerOptimizationSupport(support: WorkerOptimizationSupport): void {
  console.log(`[Worker优化方案] 浏览器兼容性检测:`);
  console.log(`  - OffscreenCanvas: ${support.supportsOffscreenCanvas ? '✅' : '❌'}`);
  console.log(`  - createImageBitmap: ${support.supportsImageBitmap ? '✅' : '❌'}`);
  console.log(`  - 优化方案可用: ${support.supportsWorkerOptimization ? '✅' : '❌'}`);
}

const timing = new TimingLogger();

// 页面指令集
interface PageInstructionsV2 {
  pageIndex: number;
  items: DrawInstructionV2[];
}


type WorkerInstruction = DrawInstructionV2[];
type ImageIndexMap = Record<number, number>;
type ImageDataMap = Record<number, Uint8Array>;
type Base64ImageMap = Record<number, string>;

type ReleasableRemote<T> = Comlink.Remote<T> & {
  [Comlink.releaseProxy]?: () => void;
};

interface ManagedWorker<T> {
  remote: ReleasableRemote<T>;
  worker: Worker;
}

interface PDFRendererWorkerAPI {
  renderPageWithBase64(
    instructions: WorkerInstruction,
    pageSize: string,
    base64Images: Base64ImageMap,
    bitmapIndexMap: ImageIndexMap
  ): Promise<ArrayBuffer>;
  renderPage(
    instructions: WorkerInstruction,
    pageSize: string,
    imageDataMap: ImageDataMap
  ): Promise<ArrayBuffer>;
}

const IS_WORKER_CONTEXT = typeof window === 'undefined' && typeof self !== 'undefined';

function createManagedComlinkWorker<T>(): ManagedWorker<T> {
  const workerUrl = new URL('./pdf-worker.ts', import.meta.url);
  const worker = new Worker(workerUrl, { type: 'module' });
  const remote = Comlink.wrap<T>(worker) as ReleasableRemote<T>;
  return { remote, worker };
}

function disposeManagedWorkers<T>(workers: ManagedWorker<T>[]): void {
  for (const { remote, worker } of workers) {
    remote[Comlink.releaseProxy]?.();
    worker.terminate();
  }
  workers.length = 0;
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
  private workers: ManagedWorker<ImageProcessor>[] = [];

  constructor(workerCount: number = navigator.hardwareConcurrency || 4) {
    for (let i = 0; i < workerCount; i++) {
      this.workers.push(createManagedComlinkWorker<ImageProcessor>());
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
        const { remote } = this.workers[i];
        promises.push(
          remote.batchProcessImages(batchUrls).then(results => {
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
    disposeManagedWorkers(this.workers);
  }
}

const workerImageProcessor: ImageProcessor = {
  async processImage(url: string): Promise<Uint8Array> {
    try {
      let absoluteUrl = url;
      if (url.startsWith('/')) {
        absoluteUrl = self.location.origin + url;
      }

      const response = await fetch(absoluteUrl);
      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer]);
      const bitmap = await createImageBitmap(blob);

      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('OffscreenCanvas 2D context is not available');
      }
      ctx.drawImage(bitmap, 0, 0);

      const jpegBlob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.85,
      });

      return new Uint8Array(await jpegBlob.arrayBuffer());
    } catch (error) {
      throw new Error(`图片处理失败: ${error}`);
    }
  },

  async batchProcessImages(urls: string[]): Promise<Uint8Array[]> {
    const results: Uint8Array[] = [];
    for (const url of urls) {
      try {
        results.push(await this.processImage(url));
      } catch (error) {
        console.error(`处理图片失败 ${url}:`, error);
        results.push(new Uint8Array(0));
      }
    }
    return results;
  },
};

const pdfRendererWorker: PDFRendererWorkerAPI = {
  async renderPage(
    instructions: WorkerInstruction,
    pageSize: string,
    imageDataMap: ImageDataMap
  ): Promise<ArrayBuffer> {
    return renderPdfInstructions(instructions, pageSize, (imageIndex) => {
      const imageData = imageDataMap[imageIndex];
      return imageData && imageData.length > 0 ? uint8ArrayToBase64(imageData) : null;
    });
  },

  async renderPageWithBase64(
    instructions: WorkerInstruction,
    pageSize: string,
    base64Images: Base64ImageMap,
    bitmapIndexMap: ImageIndexMap
  ): Promise<ArrayBuffer> {
    return renderPdfInstructions(instructions, pageSize, (imageIndex) => {
      const mappedIndex = bitmapIndexMap[imageIndex];
      return mappedIndex === undefined ? null : base64Images[mappedIndex] ?? null;
    });
  },
};

if (IS_WORKER_CONTEXT) {
  Comlink.expose({
    ...workerImageProcessor,
    ...pdfRendererWorker,
  });
}

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
  private imageUrls: string[];
  private imageInfos: PreloadImageInfo[];
  private nextImageIndex: number;

  private readonly layoutPdf: JsPdf;

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
    this.layoutPdf = pdf;
    this.pageWidth = pdf.internal.pageSize.getWidth();
    this.pageHeight = pdf.internal.pageSize.getHeight();

    this.chapter = [];
    this.serialStack = createSerialStack();
    this.allInstructions = [];
    this.currentPageInstructions = [];

    // 图片管理
    this.imageUrls = [];
    this.imageInfos = [];
    this.nextImageIndex = 0;
  }

  // 预加载器实例
  private imagePreloader: ImagePreloader | null = null;

  // 注册图片 URL，返回图片索引
  registerImage(url: string): number {
    const index = this.nextImageIndex++;
    this.imageUrls[index] = url;
    this.imageInfos[index] = { url, width: 0, height: 0 };
    return index;
  }

  // 预加载所有注册的图片
  async preloadImages(): Promise<void> {
    const support = getWorkerOptimizationSupport();

    if (!support.supportsWorkerOptimization) {
      // 降级方案：在主线程加载图片
      console.log('[Worker优化方案] 使用降级方案加载图片');
      
      for (let i = 0; i < this.imageUrls.length; i++) {
        const url = this.imageUrls[i];
        if (!url) continue;
        
        try {
          const img = await loadImage(url);
          this.imageInfos[i] = {
            url,
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
    const urls = this.imageUrls.filter(url => url !== undefined && url !== '');
    
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
    const { instructions, endY } = collectTextInstructions(this.layoutPdf, text, {
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
      this.layoutPdf,
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

  private buildCatalogPage(): DrawInstructionV2[] {
    const catalogPage: DrawInstructionV2[] = [
      {
        type: 'text',
        content: '目录',
        x: this.pageWidth / 2,
        y: 80,
        fontSize: FONT_SIZE_BASE_H4,
        align: 'center',
      },
    ];

    let currentY = 90;
    for (const item of this.chapter) {
      const { text, level, num } = item;
      const indent = 40 + 12 * (level - 1);
      const rightBorder = 40;
      const pageNumberText = num.toString();

      catalogPage.push({
        type: 'text',
        content: text,
        x: indent,
        y: currentY,
        fontSize: FONT_SIZE_BASE_H6,
        align: 'left',
      });

      catalogPage.push({
        type: 'text',
        content: pageNumberText,
        x: this.pageWidth - rightBorder,
        y: currentY,
        fontSize: FONT_SIZE_BASE_H6,
        align: 'right',
      });

      const textWidth = this.layoutPdf.getTextWidth(text);
      const pageNumWidth = this.layoutPdf.getTextWidth(pageNumberText);
      const startX = indent + textWidth;
      const endX = this.pageWidth - rightBorder - pageNumWidth;
      const dotSpace = FONT_SIZE_BASE_H6 - 3;
      const dotCount = Math.max(0, Math.floor((endX - startX) / dotSpace) - 2);

      for (let i = 0; i < dotCount; i++) {
        catalogPage.push({
          type: 'text',
          content: '.',
          x: endX - (i + 1) * dotSpace,
          y: currentY,
          fontSize: FONT_SIZE_BASE_H6 - 3,
          align: 'right',
        });
      }

      currentY += FONT_SIZE_BASE_H6 + 5;
    }

    return catalogPage;
  }

  // 添加目录页面
  addCatalog(pageNum = 1): void {
    const catalogPage = this.buildCatalogPage();

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
    const support = getWorkerOptimizationSupport();

    timing.start('指令收集');
    const pageInstructions = this.getPageInstructions();
    timing.end('指令收集');

    console.log(`[Worker优化方案] 📊 页面数量: ${pageInstructions.length}`);
    console.log(`[Worker优化方案] 📊 图片数量: ${this.imageUrls.length}`);

    timing.start('Worker 并行渲染');

    const results: ArrayBuffer[] = [];
    
    // 根据是否支持优化方案选择渲染策略
    if (!support.supportsWorkerOptimization) {
      // 降级方案：使用 base64
      console.log('[Worker优化方案] 使用降级方案，在主线程转换 base64');
      
      // 预先转换所有图片为 base64
      const base64Map: Map<number, string> = new Map();
      for (let i = 0; i < this.imageUrls.length; i++) {
        const url = this.imageUrls[i];
        if (url) {
          try {
            const base64 = await urlToBase64Async(url);
            base64Map.set(i, base64);
          } catch (err) {
            console.error(`[Worker优化方案] 图片 ${i} 转 base64 失败:`, err);
          }
        }
      }

      // 创建 Worker 池来处理降级渲染
      const fallbackWorkers: ManagedWorker<PDFRendererWorkerAPI>[] = [];
      for (let i = 0; i < this.workerCount; i++) {
        fallbackWorkers.push(createManagedComlinkWorker<PDFRendererWorkerAPI>());
      }

      // 并行处理页面
      const fallbackPagePromises = pageInstructions.map(async (page, index) => {
        const pageImageIndices = new Set<number>();
        page.items.forEach(item => {
          if (item.type === 'image') {
            pageImageIndices.add(item.imageIndex);
          }
        });

        const bitmapIndexMap: ImageIndexMap = {};
        const base64Images: Base64ImageMap = {};
        let newIdx = 0;
        
        pageImageIndices.forEach(originalIndex => {
          bitmapIndexMap[originalIndex] = newIdx;
          const base64 = base64Map.get(originalIndex);
          if (base64) {
            base64Images[newIdx] = base64;
          }
          newIdx++;
        });

        const { remote } = fallbackWorkers[index % fallbackWorkers.length];
        return await remote.renderPageWithBase64(page.items, this.pageSize, base64Images, bitmapIndexMap);
      });

      results.push(...await Promise.all(fallbackPagePromises));
      
      // 清理 Workers
      disposeManagedWorkers(fallbackWorkers);
    } else {
      // 优化方案：使用预加载的图片数据
      // 创建 Worker 池
      const workers: ManagedWorker<PDFRendererWorkerAPI>[] = [];
      for (let i = 0; i < this.workerCount; i++) {
        workers.push(createManagedComlinkWorker<PDFRendererWorkerAPI>());
      }

      // 并行渲染页面
      const pagePromises = pageInstructions.map(async (page, index) => {
        const { remote } = workers[index % workers.length];
        
        // 准备页面所需图片数据
        const pageImageIndices = new Set<number>();
        page.items.forEach(item => {
          if (item.type === 'image') {
            pageImageIndices.add(item.imageIndex);
          }
        });

        const imageDataMap: ImageDataMap = {};
        for (const imgIndex of pageImageIndices) {
          const url = this.imageUrls[imgIndex];
          if (url && this.imagePreloader) {
            const imageData = this.imagePreloader.get(url);
            if (imageData) {
              imageDataMap[imgIndex] = imageData;
            }
          }
        }

        return await remote.renderPage(page.items, this.pageSize, imageDataMap);
      });

      results.push(...await Promise.all(pagePromises));
      
      // 清理 Workers
      disposeManagedWorkers(workers);
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

    // 清理图片预加载器
    if (this.imagePreloader) {
      await this.imagePreloader.terminate();
      this.imagePreloader = null;
    }

    // 下载
    const pdfBytes = new Uint8Array(mergedPdf);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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
  const support = getWorkerOptimizationSupport();
  console.log('\n========== [Worker优化方案] 开始导出 PDF ==========');
  logWorkerOptimizationSupport(support);
  console.log(`[Worker优化方案] 浏览器优化支持: ${support.supportsWorkerOptimization ? '✅ 是' : '❌ 否，使用降级方案'}`);

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
