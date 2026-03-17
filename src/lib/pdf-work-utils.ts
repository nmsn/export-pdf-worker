import JsPdf from 'jspdf';
import { autoTable } from 'jspdf-autotable';

export interface TimingRecord {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

export class TimingLogger {
  private records: TimingRecord[] = [];
  private currentRecord: TimingRecord | null = null;
  private counters: Map<string, number> = new Map();

  start(name: string): void {
    const record: TimingRecord = { name, startTime: performance.now() };
    this.records.push(record);
    this.currentRecord = record;
    console.log(`[Worker优化方案] ⏱️ 开始: ${name}`);
  }

  end(name: string): number {
    const endTime = performance.now();
    const record =
      [...this.records].reverse().find((item) => item.name === name && item.endTime === undefined) ??
      this.currentRecord;

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
    this.records.forEach((record) => {
      if (record.duration) {
        console.log(`  ${record.name}: ${record.duration.toFixed(2)}ms`);
        total += record.duration;
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

export const FONT_SIZE_BASE_H1 = 36;
export const FONT_SIZE_BASE_H2 = 24;
export const FONT_SIZE_BASE_H3 = 20;
export const FONT_SIZE_BASE_H4 = 16;
export const FONT_SIZE_BASE_H5 = 14;
export const FONT_SIZE_BASE_H6 = 12;
export const FONT_SIZE_BASE_H7 = 10;

export const PDF_PADDING = 10;
export const PDF_BORDER = 20;

export interface TextInstruction {
  type: 'text';
  content: string;
  x: number;
  y: number;
  fontSize: number;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
}

export interface ImageInstructionV2 {
  type: 'image';
  imageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableInstruction {
  type: 'table';
  head: (string | number | boolean)[][];
  body: (string | number | boolean)[][];
  startY: number;
  headStyles?: Record<string, unknown>;
  bodyStyles?: Record<string, unknown>;
  columnStyles?: Record<string, unknown>;
}

export type DrawInstructionV2 = TextInstruction | ImageInstructionV2 | TableInstruction;

export interface PreloadImageInfo {
  url: string;
  width: number;
  height: number;
}

interface SerialItem {
  parentLevel: number;
  curSeries: number[];
  curLevel: number;
  imgNumber: number;
  tableNumber: number;
}

export interface SerialStack {
  setSerial: (level: number) => string;
  getSerial: () => string;
  getSerialArray: () => number[];
  getImgSerial: () => string;
  getTableSerial: () => string;
}

export function createSerialStack(): SerialStack {
  const serial: SerialItem[] = [
    { parentLevel: 0, curLevel: 0, curSeries: [], imgNumber: 0, tableNumber: 0 },
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
          tableNumber: 0,
        });
      } else if (pre.curLevel < level) {
        serial.push({
          parentLevel: pre.curLevel,
          curSeries: pre.curSeries.concat(1),
          curLevel: level,
          imgNumber: 0,
          tableNumber: 0,
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
          tableNumber: 0,
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
    },
  };
}

export function easyCn2An(num: number): string {
  if (!Number.isInteger(num) || num < 1 || num > 10) {
    throw new Error(`Unsupported chapter number: ${num}`);
  }
  const source = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  return source[num - 1];
}

export interface PositionConfig {
  align?: 'center' | 'left' | 'right';
  pageWidth?: number;
  imgWidth?: number;
  border?: number;
}

export function getPositionX(config?: PositionConfig): number {
  const { align = 'center', pageWidth = 0, imgWidth = 0, border = 0 } = config || {};
  if (align === 'center') return (pageWidth - imgWidth) / 2;
  if (align === 'left') return border;
  if (align === 'right') return pageWidth - border - imgWidth;
  return 0;
}

export interface TextConfig {
  x?: number;
  y?: number;
  fontSize?: number;
  align?: 'left' | 'center' | 'right';
  border?: number;
  maxWidth?: number;
  pageWidth?: number;
  indent?: boolean;
}

export interface CollectTextResult {
  instructions: TextInstruction[];
  endY: number;
  endX: number;
}

export function collectTextInstructions(
  pdf: JsPdf,
  text: string,
  config?: TextConfig
): CollectTextResult {
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
    let positionX = 0;
    if (align === 'center') positionX = pageWidth / 2;
    if (align === 'left') positionX = border;
    if (align === 'right') positionX = pageWidth - border - maxWidth;

    const { h } = pdf.getTextDimensions(text, { maxWidth });
    const textHeight = h * pdf.getLineHeightFactor();
    const singleLineHeight = textHeight / lines;
    const realX = x ?? positionX;
    const instructions: TextInstruction[] = [];

    if (indent) {
      positionX = border;
      let currentY = y + singleLineHeight;
      const indentText = `xx${text}`;
      const indentLines = pdf.splitTextToSize(indentText, maxWidth);
      const { w: indentWidth } = pdf.getTextDimensions('xx');

      indentLines.forEach((line, index) => {
        instructions.push({
          type: 'text',
          content: index === 0 ? line.slice(2) : line,
          x: index === 0 ? positionX + indentWidth : positionX,
          y: currentY,
          fontSize,
        });
        currentY += singleLineHeight;
      });

      return { instructions, endY: currentY, endX: positionX + textWidth };
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

  let positionX = 0;
  if (align === 'center') positionX = (pageWidth - textWidth) / 2;
  if (align === 'left') positionX = border;
  if (align === 'right') positionX = pageWidth - border - textWidth;

  const realX = x ?? positionX;
  const { h } = pdf.getTextDimensions(text, { maxWidth });
  const textHeight = h * pdf.getLineHeightFactor();

  return {
    instructions: [
      {
        type: 'text',
        content: text,
        x: realX,
        y: y + textHeight,
        fontSize,
        maxWidth,
      },
    ],
    endY: y + textHeight,
    endX: realX + textWidth,
  };
}

export interface ImgConfig {
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

export interface CollectImgResultV2 {
  instructions: DrawInstructionV2[];
  endY: number;
  needNewPage: boolean;
}

export function collectImageInstructionsV2(
  pdf: JsPdf,
  imageIndex: number,
  imageInfo: PreloadImageInfo,
  currentY: number,
  config?: ImgConfig
): CollectImgResultV2 {
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

  let targetWidth = (() => {
    if (width && fill) return Math.min(width, maxWidth);
    if (width) return width;
    if (fill) return maxWidth;
    return imgWidth > maxWidth ? maxWidth : imgWidth;
  })();

  const ratio = imgWidth / targetWidth;
  let targetHeight = imgHeight / ratio;
  let bottomTextHeight = 0;

  if (bottomText) {
    const { h } = pdf.getTextDimensions(bottomText, { maxWidth });
    bottomTextHeight = h * pdf.getLineHeightFactor();
    targetHeight += bottomTextHeight;
  }

  const addPageInitY = headerHeight + border;
  const instructions: DrawInstructionV2[] = [];

  if (targetHeight > pageHeight - 2 * border) {
    targetHeight = pageHeight - 2 * border - bottomTextHeight;
    const zoomRatio = targetHeight / imgHeight;
    targetWidth = imgWidth * zoomRatio;
    const positionX = getPositionX({ imgWidth: targetWidth, pageWidth, align, border });

    instructions.push({
      type: 'image',
      imageIndex,
      x: x ?? positionX,
      y: addPageInitY,
      width: targetWidth,
      height: targetHeight,
    });

    return { instructions, endY: addPageInitY + targetHeight, needNewPage: currentY !== PDF_BORDER };
  }

  if (targetHeight > pageHeight - currentY - border) {
    const remainHeight = pageHeight - border - currentY - bottomTextHeight;
    const remainPercent = remainHeight / pageHeight;
    const imgZoomRatio = remainHeight / imgHeight;

    if (remainPercent >= minHeightPercent) {
      const positionX = getPositionX({
        imgWidth: imgZoomRatio * imgWidth,
        pageWidth,
        align,
        border,
      });

      instructions.push({
        type: 'image',
        imageIndex,
        x: x ?? positionX,
        y: currentY,
        width: imgWidth * imgZoomRatio,
        height: remainHeight,
      });

      return { instructions, endY: currentY + remainHeight, needNewPage: false };
    }

    const positionX = getPositionX({ imgWidth: targetWidth, pageWidth, align, border });
    instructions.push({
      type: 'image',
      imageIndex,
      x: x ?? positionX,
      y: addPageInitY,
      width: targetWidth,
      height: targetHeight - bottomTextHeight,
    });

    return { instructions, endY: addPageInitY + targetHeight - bottomTextHeight, needNewPage: true };
  }

  const positionX = getPositionX({ imgWidth: targetWidth, pageWidth, align, border });
  instructions.push({
    type: 'image',
    imageIndex,
    x: x ?? positionX,
    y: currentY,
    width: targetWidth,
    height: targetHeight - bottomTextHeight,
  });

  return { instructions, endY: currentY + targetHeight - bottomTextHeight, needNewPage: false };
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Load img ${src} failed.`));
    image.src = src;
    image.crossOrigin = 'anonymous';
  });
}

export function imageToBase64(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context!.drawImage(image, 0, 0, image.width, image.height);
  return canvas.toDataURL('image/png');
}

export async function urlToBase64Async(url: string): Promise<string> {
  const img = await loadImage(url);
  return imageToBase64(img);
}

export async function imageBitmapToBase64(bitmap: ImageBitmap): Promise<string> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);

  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return 'data:image/jpeg;base64,' + btoa(binary);
}

export function renderPdfInstructions(
  instructions: DrawInstructionV2[],
  pageSize: string,
  resolveImageSource: (imageIndex: number) => string | null
): ArrayBuffer {
  const doc = new JsPdf('p', 'px', pageSize);

  for (const item of instructions) {
    if (item.type === 'text') {
      doc.setFontSize(item.fontSize);
      doc.text(item.content, item.x, item.y, {
        align: item.align,
        maxWidth: item.maxWidth,
      });
      continue;
    }

    if (item.type === 'image') {
      const imageSource = resolveImageSource(item.imageIndex);
      if (imageSource) {
        doc.addImage(imageSource, 'JPEG', item.x, item.y, item.width, item.height, '', 'FAST');
      }
      continue;
    }

    const tableOptions = {
      startY: item.startY,
      theme: 'grid',
      head: item.head,
      body: item.body,
      headStyles: item.headStyles,
      bodyStyles: item.bodyStyles,
      columnStyles: item.columnStyles,
    } as Parameters<typeof autoTable>[1];
    autoTable(doc, tableOptions);
  }

  return doc.output('arraybuffer');
}
