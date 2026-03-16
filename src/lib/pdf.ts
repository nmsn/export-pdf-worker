
import JsPdf from 'jspdf';
import { autoTable } from 'jspdf-autotable'
// import dayjs from 'dayjs';
// import {
//   getCoverImg,
//   getBackCoverImg,
// } from './export-utils';

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
    console.log(`[传统方案] ⏱️ 开始: ${name}`);
  }

  end(name: string): number {
    const endTime = performance.now();
    const record = this.records.find(r => r.name === name && !r.endTime) || this.currentRecord;
    
    if (record && record.name === name) {
      record.endTime = endTime;
      record.duration = endTime - record.startTime;
      console.log(`[传统方案] ⏱️ 完成: ${name} - 耗时: ${record.duration.toFixed(2)}ms`);
      return record.duration;
    }
    
    console.warn(`[传统方案] ⚠️ 未找到匹配的计时记录: ${name}`);
    return 0;
  }

  log(name: string, duration: number): void {
    console.log(`[传统方案] ⏱️ ${name}: ${duration.toFixed(2)}ms`);
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
    console.log('\n========== [传统方案] 执行时间汇总 ==========');
    let total = 0;
    this.records.forEach(r => {
      if (r.duration) {
        console.log(`  ${r.name}: ${r.duration.toFixed(2)}ms`);
        total += r.duration;
      }
    });
    console.log(`  总计: ${total.toFixed(2)}ms`);
    console.log('=============================================\n');
  }
}

const timing = new TimingLogger();

/**
 * 获取封面创建日期
 * @returns {string} 创建日期
 */
// function getCreateDate(): string {
//   return `Date: ${dayjs().format('YYYY/MM/DD')}`;
// }

/**
 * 图片 url 转换为 base64 字符串
 * @param {string} url url
 * @returns {Promise<string>} base64 字符串
 */
async function urlToBase64Async(url: string): Promise<string> {
  const img = await loadImage(url);
  return imageToBase64(img);
}


function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = function () {
      resolve(image);
    };
    image.onerror = function () {
      reject(new Error(`Load img ${src} failed.`));
    };
    image.src = src;
    image.crossOrigin = "anonymous";//添加此行anonymous必须小写
  });
}

/**
 * HTML IMG 元素转换为 base64 字符串
 * @param {HTMLImageElement} image Img标签元素
 * @returns {string} base64字符串
 */
function imageToBase64(image: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  const width = image.width;
  const height = image.height;

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context!.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

/**
 * 二进制转换为 URL
 * @param {Blob} data 二进制数据
 * @returns {string} URL
 */
function blobToUrl(data: Blob): string {
  const blob = new Blob([data], { type: 'image/jpeg' }); // 假设 data 包含图像数据，类型为 image/jpeg
  const url = URL.createObjectURL(blob);

  return url;
}

/**
 * Blob 转换为 base64 字符串
 * @param {Blob} blob 二进制数据
 * @returns {Promise<string>} base64 字符串
 */
function blobToBase64Async(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    // 读取文件完成时的回调函数
    reader.onloadend = function () {
      // 读取结果是一个 base64 字符串
      const base64data = reader.result as string;
      resolve(base64data);
    };

    reader.onerror = function (e) {
      reject(e);
    };

    // 读取二进制文件
    reader.readAsDataURL(blob);

    // resolve(reader.result);
  });
}

/**
 * 传入图片，自动转换base64
 * 输出base64和Image HTML元素
 * @param {string|HTMLImageElement|Blob|Promise<string>} img img数据
 * @returns {Promise<TransformResult>} base64 和 Image HTML 元素
 */
async function transformImageToBase64AndImg(img: string | HTMLImageElement | Blob | Promise<string>): Promise<{ base64: string; img: HTMLImageElement }> {
  const startTime = performance.now();
  const count = timing.increment('transformImage');

  // FIX: 支持Promise
  if (img instanceof Promise) {
    const result = await transformImageToBase64AndImg(await img);
    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ transformImageToBase64AndImg #${count} (Promise): ${(endTime - startTime).toFixed(2)}ms`);
    return result;
  }

  let result;

  if (img instanceof HTMLImageElement) {
    result = {
      base64: imageToBase64(img),
      img
    };
  } else if (typeof img === 'string') {
    // base64
    if (img.startsWith('data:image')) {
      result = {
        base64: img,
        img: await loadImage(img)
      };
    } else {
      // 图片url
      result = {
        base64: await urlToBase64Async(img),
        img: await loadImage(img)
      };
    }
  } else {
    // 图片blob
    result = {
      base64: await blobToBase64Async(img),
      img: await loadImage(blobToUrl(img))
    };
  }

  const endTime = performance.now();
  console.log(`[传统方案] ⏱️ transformImageToBase64AndImg #${count}: ${(endTime - startTime).toFixed(2)}ms`);
  return result;
}

const easyCn2An = (num: number): string => {
  if (!Number(num) && (num <= 0 || num > 10)) {
    throw new Error();
  }
  const source = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

  return source[num - 1];
};

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


/**
 * 记录当前heading、图片序号、表格序号
 * @returns {SerialStack} 记录序号的对象
 */
function createSerialStack(): SerialStack {
  /**
   * 序号栈
   */
  const serial: SerialItem[] = [
    {
      parentLevel: 0,
      curLevel: 0,
      curSeries: [],
      imgNumber: 0,
      tableNumber: 0
    }
  ];

  return {
    /**
     * 根据新的标题的级别，更新序号栈
     * @param {number} level 标题级别
     * @returns {string} 标题序号
     */
    setSerial(level: number): string {
      let pre = serial[serial.length - 1];
      if (pre.curLevel === level) {
        // 当前标题是前一个的同级标题
        serial.push({
          parentLevel: pre.parentLevel,
          curSeries: [
            ...pre.curSeries.slice(0, -1),
            pre.curSeries[pre.curSeries.length - 1] + 1
          ],
          curLevel: level,
          imgNumber: 0,
          tableNumber: 0
        });
      } else if (pre.curLevel < level) {
        // 当前标题是前一个的子标题
        serial.push({
          parentLevel: pre.curLevel,
          curSeries: pre.curSeries.concat(1),
          curLevel: level,
          imgNumber: 0,
          tableNumber: 0
        });
      } else {
        // 当前标题是前一个的父标题
        while (pre.curLevel > level && pre.curLevel !== 0) {
          serial.pop();
          pre = serial[serial.length - 1];
        }
        serial.push({
          parentLevel: pre.parentLevel,
          curSeries: [
            ...pre.curSeries.slice(0, -1),
            pre.curSeries[pre.curSeries.length - 1] + 1
          ],
          curLevel: level,
          imgNumber: 0,
          tableNumber: 0
        });
      }
      return this.getSerial();
    },
    /**
     * 获取当前的标题序号
     * @returns {string} 标题序号
     */
    getSerial(): string {
      const lastSerial = serial[serial.length - 1];
      if (lastSerial.curLevel === 1) {
        return `Chap ${easyCn2An(lastSerial.curSeries[0])}`;
      }
      return lastSerial.curSeries.join('.');
    },
    /**
     * 获取当前标题的序号数组
     * @returns {number[]} 标题序号数组
     */
    getSerialArray(): number[] {
      return serial[serial.length - 1].curSeries;
    },
    /**
     * 获取当前标题下的图片序号，获取后会更新图片序号
     * @returns {string} 图片序号
     */
    getImgSerial(): string {
      // FIX: 如果没有所属的父标题，直接返回空字符串
      if (serial.length === 1) {
        return '';
      }
      const lastSerial = serial[serial.length - 1];
      return [...lastSerial.curSeries, ++lastSerial.imgNumber].join('.');
    },
    /**
     * 获取当前标题下的表格序号，获取后会更新图片序号
     * @returns {string} 表格序号
     */
    getTableSerial(): string {
      // FIX: 如果没有所属的父标题，直接返回空字符串
      if (serial.length === 1) {
        return '';
      }
      const lastSerial = serial[serial.length - 1];
      return [...lastSerial.curSeries, ++lastSerial.tableNumber].join('.');
    }
  };
}

// 扩展的JsPdf类型定义
/// <reference path="./jspdf-extensions.d.ts" />

export const FONT_SIZE_BASE_H1 = 36; // 封面标题字号
export const FONT_SIZE_BASE_H2 = 24; // 章节标题（一级标题）
export const FONT_SIZE_BASE_H3 = 20; // 章节标题（二级标题）
export const FONT_SIZE_BASE_H4 = 16; // 大文本（目录标题）
export const FONT_SIZE_BASE_H5 = 14; // 标准文本（图片下标）
export const FONT_SIZE_BASE_H6 = 12; // 最小文本（封面标题，二级目录）
export const FONT_SIZE_BASE_H7 = 10; // table 文本的默认字号（一般情况下不用设置）

export const PDF_PADDING = 10;
export const PDF_BORDER = 20;


const TEST_TEXT = 'test_text';

interface PositionConfig {
  align?: 'center' | 'left' | 'right';
  pageWidth?: number;
  imgWidth?: number;
  border?: number;
}

const getPositionX = (config?: PositionConfig) => {
  const { align = 'center', pageWidth = 0, imgWidth = 0, border = 0 } = config || {};

  if (align === 'center') {
    return (pageWidth - imgWidth) / 2;
  }

  if (align === 'left') {
    return border;
  }

  if (align === 'right') {
    return pageWidth - border - imgWidth;
  }
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

interface TextResult {
  y: number;
  endY: number;
  x: number;
  endX: number;
}

const drawText = (pdf: JsPdf, text: string, config?: TextConfig): TextResult => {
  const startTime = performance.now();
  const count = timing.increment('drawText');

  const {
    x,
    y = 0,
    fontSize = FONT_SIZE_BASE_H2,
    align = 'left',
    // pdf 四周的留白
    border = PDF_BORDER,
    pageWidth = 0,
    indent = false,
  } = config || {};

  const maxWidth = config?.maxWidth ?? pageWidth ?? 0;

  pdf.setFontSize(fontSize);

  const textWidth = pdf.getTextWidth(text);
  const lines =
    maxWidth > 0 ? pdf.splitTextToSize(text, maxWidth, { fontSize }).length : 1;

  if (lines > 1) {
    let _positionX = 0;


    if (align === 'center') {
      _positionX = pageWidth / 2;
    }

    if (align === 'left') {
      _positionX = border;
    }

    if (align === 'right') {
      _positionX = pageWidth - border - maxWidth;
    }

    const { h } = pdf.getTextDimensions(text, { maxWidth });
    const textHeight = h * pdf.getLineHeightFactor();

    const singleLineHeight = textHeight / lines;

    if (indent) {
      // 有缩进的，那一定是左对齐
      _positionX = border;
      let _y = y + singleLineHeight;
      const _text = `xx${text}`;
      const indentLines = pdf.splitTextToSize(_text, maxWidth);

      const { w: indentWidth } = pdf.getTextDimensions('xx');
      indentLines.forEach((line, idx) => {
        const lineX = idx === 0 ? _positionX + indentWidth : _positionX; // 首行缩进，其余顶格
        const _line = idx === 0 ? line.slice(2) : line;
        pdf.text(_line, lineX, _y);
        _y += singleLineHeight;
      });

      const endTime = performance.now();
      console.log(`[传统方案] ⏱️ drawText #${count} (多行缩进): ${(endTime - startTime).toFixed(2)}ms`);

      return {
        y,
        endY: _y,
        x: _positionX,
        endX: _positionX + textWidth
      }
    }

    const realX = x ?? _positionX;


    const _y = y + singleLineHeight;
    const _endY = y + textHeight;

    pdf.text(text, realX, _y, {
      maxWidth,
      align
    });
    pdf.setDrawColor(0, 0, 0);

    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ drawText #${count} (多行): ${(endTime - startTime).toFixed(2)}ms`);

    return {
      y,
      endY: _endY,
      x: realX,
      endX: realX + maxWidth
    };
  }

  let _positionX = 0;

  // 计算文本的横向位置
  if (align === 'center') {
    _positionX = (pageWidth - textWidth) / 2;
  }

  if (align === 'left') {
    _positionX = border;
  }

  if (align === 'right') {
    _positionX = pageWidth - border - textWidth;
  }

  const realX = x ?? _positionX;

  const { h } = pdf.getTextDimensions(text, { maxWidth });
  const textHeight = h * pdf.getLineHeightFactor();
  const _y = y + textHeight;
  pdf.text(text, realX, _y, {
    maxWidth
  });
  pdf.setDrawColor(0, 0, 0);

  const endTime = performance.now();
  console.log(`[传统方案] ⏱️ drawText #${count}: ${(endTime - startTime).toFixed(2)}ms`);

  return {
    y,
    endY: _y,
    x: realX,
    endX: realX + textWidth
  };
};

interface ImgConfig {
  x?: number;
  y?: number;
  width?: number;
  align?: 'center' | 'left' | 'right';
  border?: number;
  headerHeight?: number;
  fill?: boolean;
  addPage?: () => Promise<{ y: number }>;
  autoAddPage?: boolean;
  minHeightPercent?: number;
  pageWidth?: number;
  pageHeight?: number;
  bottomText?: string;
}

interface ImgResult {
  x?: number;
  y: number;
  endX?: number;
  endY: number;
}

const drawImg = async (pdf: JsPdf, imgUrl: string, config?: ImgConfig): Promise<ImgResult> => {
  const startTime = performance.now();
  const count = timing.increment('drawImg');

  const {
    x = 0,
    y = 0,
    width,
    align = 'center',
    border = PDF_BORDER,
    headerHeight = 0,
    // blob url base64 imgObj
    fill = false,
    addPage,
    autoAddPage = true,
    minHeightPercent = 0.8, // 图片最小的高度占页面总高度的比例，用于图片缩放后的在最小高度
    pageWidth = 0,
    pageHeight = 0
  } = config || {};

  if (!imgUrl) {
    return {
      y,
      endY: y
    };
  }

  const maxWidth = pageWidth - 2 * border;

  // TODO 可能某些类型图片加载不出来
  // const img = await loadImage(imgUrl);

  const transformStart = performance.now();
  const { base64: urlBase64, img } = await transformImageToBase64AndImg(imgUrl);
  const transformEnd = performance.now();
  console.log(`[传统方案] ⏱️ drawImg #${count} - 图片转换: ${(transformEnd - transformStart).toFixed(2)}ms`);

  const imgWidth = img.width;
  const imgHeight = img.height;

  let _width = (() => {
    if (width && fill) {
      return Math.min(width, maxWidth)
    }

    // 给了确定宽度
    if (width) {
      return width;
    }

    // 是否撑满
    if (fill) {
      return maxWidth;
    }

    return imgWidth > maxWidth ? maxWidth : imgWidth;
  })();

  const _ratio = imgWidth / _width;
  let _height = imgHeight / _ratio;
  let _bottomTextHeight = 0;

  // FIX: 如果图片存在底部文本，需要算在图片总高度中
  const bottomText = config?.bottomText;
  if (bottomText) {
    const { h } = pdf.getTextDimensions(bottomText, { maxWidth });
    _bottomTextHeight = h * pdf.getLineHeightFactor();
    _height += _bottomTextHeight;
  }

  const addPageInitY = headerHeight + border;

  // 一整个页面都不能完整放下图片的情况
  const isExceedPageLength = _height > pageHeight - 2 * border;
  if (isExceedPageLength && autoAddPage) {
    _height = pageHeight - 2 * border - _bottomTextHeight;
    const zoomRatio = _height / imgHeight;
    _width = imgWidth * zoomRatio;

    const _positionX = getPositionX({
      imgWidth: _width,
      pageWidth,
      align,
      border
    });
    const _x = x ?? _positionX;

    // 不是一个新的页面
    if (y !== PDF_BORDER && autoAddPage) {
      await addPage?.();
    }

    const addImageStartTime = performance.now();
    pdf.addImage(
      urlBase64,
      'JPEG',
      x ?? _positionX,
      addPageInitY,
      _width,
      _height,
      '',
      'FAST'
    );
    const addImageEndTime = performance.now();
    console.log(`[传统方案] ⏱️ drawImg #${count} - addImage (超出页面): ${(addImageEndTime - addImageStartTime).toFixed(2)}ms`);

    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ drawImg #${count} 总耗时: ${(endTime - startTime).toFixed(2)}ms`);

    return {
      x: _x,
      y: y,
      endX: _x,
      endY: addPageInitY + _height
    };
  }

  // 当前页面剩下的空间不足以放下完整图片
  const isExceedCurrentLength = _height > pageHeight - y - border;
  if (isExceedCurrentLength) {
    // 伸缩图片，放在当前页面中
    const remainHeight = pageHeight - border - y - _bottomTextHeight;
    // 如果剩余空间全部放图片，当前图片占页面总高的比例
    const remainPercent = remainHeight / pageHeight;
    const imgZoomRatio = remainHeight / imgHeight;

    // 剩余的空间可以放下缩放后的图片
    if (remainPercent >= minHeightPercent) {
      const _positionX = getPositionX({
        imgWidth: imgZoomRatio * imgWidth,
        pageWidth,
        align,
        border
      });
      const _x = x ?? _positionX;

      const addImageStartTime = performance.now();
      pdf.addImage(
        urlBase64,
        'JPEG',
        _x,
        y,
        imgWidth * imgZoomRatio,
        remainHeight,
        '',
        'FAST'
      );
      const addImageEndTime = performance.now();
      console.log(`[传统方案] ⏱️ drawImg #${count} - addImage (缩放适应): ${(addImageEndTime - addImageStartTime).toFixed(2)}ms`);

      const endTime = performance.now();
      console.log(`[传统方案] ⏱️ drawImg #${count} 总耗时: ${(endTime - startTime).toFixed(2)}ms`);

      return {
        x: _x,
        y: y,
        endX: _x,
        endY: y + remainHeight
      };
    }

    const _positionX = getPositionX({
      imgWidth: _width,
      pageWidth,
      align,
      border
    });
    const _x = x ?? _positionX;
    // 不伸缩，直接翻页显示
    let newY;
    if (autoAddPage) {
      // 翻页后，需要重新定位头部位置
      const { y: newPageInitY } = await addPage?.() ?? { y: 0 };
      newY = newPageInitY;
    }
    const realY = newY ?? y;
    const addImageStartTime = performance.now();
    pdf.addImage(urlBase64, 'JPEG', _x, realY, _width, _height, '', 'FAST');
    const addImageEndTime = performance.now();
    console.log(`[传统方案] ⏱️ drawImg #${count} - addImage (翻页): ${(addImageEndTime - addImageStartTime).toFixed(2)}ms`);

    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ drawImg #${count} 总耗时: ${(endTime - startTime).toFixed(2)}ms`);

    return {
      x: _x,
      y: realY,
      endX: _x,
      endY: realY + _height
    };
  }
  const _positionX = getPositionX({
    imgWidth: _width,
    pageWidth,
    align,
    border
  });
  const _x = x ?? _positionX;

  // 一般情况
  const addImageStartTime = performance.now();
  pdf.addImage(
    urlBase64,
    'JPEG',
    _x,
    y,
    _width,
    _height - _bottomTextHeight,
    '',
    'FAST'
  );
  const addImageEndTime = performance.now();
  console.log(`[传统方案] ⏱️ drawImg #${count} - addImage (一般): ${(addImageEndTime - addImageStartTime).toFixed(2)}ms`);

  const endTime = performance.now();
  console.log(`[传统方案] ⏱️ drawImg #${count} 总耗时: ${(endTime - startTime).toFixed(2)}ms`);

  return {
    x: _x,
    y,
    endX: _x,
    endY: y + _height - _bottomTextHeight
  };
};

interface TableStyles {
  [key: string]: any;
}

interface TableConfig {
  head?: (string | number | boolean)[][];
  body?: (string | number | boolean)[][];
  bodyStyles?: TableStyles;
  headStyles?: TableStyles;
  columnStyles?: TableStyles;
}

interface TableResult {
  endY: number;
}

interface DrawTableConfig {
  y?: number;
  title?: string;
  pageWidth?: number;
}

export const drawTable = (pdf: JsPdf, tableConfig?: TableConfig, config?: DrawTableConfig): TableResult => {
  const startTime = performance.now();
  const count = timing.increment('drawTable');

  const { y, title, pageWidth } = config || {};

  let tableY = y;
  if (title) {
    const { endY: endY2 } = drawText(pdf, title, {
      y,
      align: 'center',
      fontSize: 14,
      pageWidth
    });

    // FIX：添加表格标题后，+10防止表格遮挡标题
    tableY = endY2 + 10;
  }

  const {
    head = [],
    body = [],
    bodyStyles = {},
    headStyles = {},
    columnStyles = {}
  } = tableConfig || {};

  autoTable(pdf, {
    startY: tableY,
    theme: 'grid',
    head,
    body,
    styles: {
      font: 'font'
    },
    headStyles: {
      fillColor: '#c00000',
      font: 'font',
      halign: 'center',
      valign: 'middle',
      ...headStyles
    },
    bodyStyles: {
      font: 'font',
      halign: 'center',
      valign: 'middle',
      ...bodyStyles
    },
    columnStyles: {
      ...columnStyles
    }
  });

  const endPosY = pdf.lastAutoTable.finalY;

  const endTime = performance.now();
  console.log(`[传统方案] ⏱️ drawTable #${count}: ${(endTime - startTime).toFixed(2)}ms`);

  return {
    // TODO 底部值处理
    endY: endPosY + 10
  };
};

interface ChapterItem {
  text: string;
  level: number;
  num: number;
}

interface SectionConfig extends TextConfig {
  y: number;
}

// TODO 放到函数当中
const drawSection = (pdf: JsPdf, chapter: ChapterItem[], config: SectionConfig) => {
  let { y: lastEndY } = config;
  chapter.forEach(item => {
    const { text, level, num } = item;
    const { border = PDF_BORDER, fontSize = FONT_SIZE_BASE_H6 } = config;

    // const no = level === 1 ? easyCn2An(index[0]) : index.join('.');
    // const title = `${no} ${text}`;
    // 文本
    const { endY: parentEndY, endX: sectionEndX } = drawText(pdf, text, {
      ...config,
      y: lastEndY,
      fontSize: fontSize,
      align: 'left',
      border: border + 12 * (level - 1)
    });

    // 页数
    const { x: pageNumX } = drawText(pdf, num.toString(), {
      ...config,
      y: lastEndY,
      align: 'right',
      fontSize,
      border: border + 12
    });

    // 控制 … 的宽度，达到连接顺畅的程度
    const _fontSize = fontSize - 3;
    const amount = Math.floor((pageNumX - sectionEndX) / _fontSize);
    for (let i = 1; i < amount - 1; i++) {
      drawText(pdf, '…', {
        ...config,
        y: lastEndY,
        x: pageNumX - (i + 1) * _fontSize,
        align: 'right'
      });
    }

    lastEndY = parentEndY + fontSize;
  });
};

// const drawCover = async (pdf: JsPdf, name: string) => {
//   pdf.insertPage(1);
//   const width = pdf.internal.pageSize.getWidth();
//   const height = pdf.internal.pageSize.getHeight();
//   await drawImg(pdf, getCoverImg(), {
//     x: 0,
//     y: 0,
//     width,
//     pageWidth: width,
//     pageHeight: height,
//     fill: true,
//   });

//   drawText(pdf, `${name}`, {
//     align: 'left',
//     x: 52,
//     y: height * 0.75,
//     fontSize: 32,
//     maxWidth: 300,
//     pageWidth: width
//   });

//   drawText(pdf, getCreateDate(), {
//     align: 'left',
//     x: 52,
//     y: height * 0.895,
//     fontSize: 14,
//     pageWidth: width
//   });
// };

// const drawBackCover = async (pdf: JsPdf) => {
//   pdf.addPage();
//   const width = pdf.internal.pageSize.getWidth();
//   const height = pdf.internal.pageSize.getHeight();
//   await drawImg(pdf, getBackCoverImg(), {
//     x: 0,
//     y: 0,
//     width,
//     pageWidth: width,
//     pageHeight: height,
//     fill: true,
//   });
// };

interface PDFConfig {
  pageSize?: string;
  fontSize?: number;
  border?: number;
  padding?: number;
  headerImg?: string;
}

interface Chapter {
  index: number[];
  text: string;
  num: number;
  level: number;
}

interface AddPageResult {
  y: number;
}

interface FontSizeMap {
  [key: string]: number;
}

// 从export-utils.ts导入的SerialStack类型
interface SerialStack {
  setSerial: (level: number) => string;
  getSerial: () => string;
  getSerialArray: () => number[];
  getImgSerial: () => string;
  getTableSerial: () => string;
}

export class PDF {
  border: number;
  padding: number;
  pageSize: string;
  fontSize: number;
  headerImg: string;
  headerHeight: number;
  x: number;
  y: number;
  pdf: JsPdf;
  pageWidth: number;
  pageHeight: number;
  chapter: Chapter[];
  serialStack: SerialStack;

  constructor(config: PDFConfig = {}) {
    const {
      pageSize = 'a4',
      fontSize = FONT_SIZE_BASE_H2,
      border = PDF_BORDER,
      padding = PDF_PADDING,
      headerImg = ''
    } = config;
    // 纸张周围的留白，目前统一处理
    this.border = border;
    // 多个渲染内容之间的留白
    this.padding = padding;
    // 默认 a4
    this.pageSize = pageSize;
    // TODO 默认文本字体大小
    this.fontSize = fontSize;

    this.headerImg = headerImg;
    this.headerHeight = 0;

    // 初始化坐标
    this.x = border;
    this.y = border;

    const pdf = new JsPdf('p', 'px', pageSize);

    this.pdf = pdf;

    this.pageWidth = pdf.internal.pageSize.getWidth();
    this.pageHeight = pdf.internal.pageSize.getHeight();

    this.chapter = [];

    this.serialStack = createSerialStack();
  }

  async addHeader(): Promise<void> {
    const startTime = performance.now();
    if (!this.headerImg) {
      // this.y = endY + 5;
      this.headerHeight = 0;
      return;
    }

    const { endY = 0 } = await drawImg(this.pdf, this.headerImg, {
      x: 0,
      y: 10,
      width: this.pageWidth - 10,
      pageWidth: this.pageWidth,
      pageHeight: this.pageHeight
    });
    this.y = endY + 5;
    if (this.headerHeight === 0) {
      this.headerHeight = endY;
    }
    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ addHeader: ${(endTime - startTime).toFixed(2)}ms`);
  }

  async addPage(): Promise<AddPageResult> {
    const startTime = performance.now();
    this.pdf.addPage();
    // 自动添加头部图片
    if (this.headerImg) {
      await this.addHeader();
    } else {
      this.y = this.border + 5;
    }
    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ addPage: ${(endTime - startTime).toFixed(2)}ms`);
    return {
      y: this.y
    };
  }

  getCurrentPageNum(): number {
    return this.pdf.getCurrentPageInfo().pageNumber;
  }

  // 增加章节信息
  async addChapter(title: string, level: number): Promise<void> {
    const startTime = performance.now();
    // 初始的默认有一页，为第一页添加头部图片
    if (level === 1 && this.chapter && !this.chapter.length) {
      await this.addHeader();
    }

    const fontSizeMap: FontSizeMap = {
      1: FONT_SIZE_BASE_H2,
      2: FONT_SIZE_BASE_H3,
      3: FONT_SIZE_BASE_H3
    };

    // TODO 第一个没有索引

    const _pageNum = this.getCurrentPageNum();

    this.serialStack.setSerial(level);

    const _title = `${this.serialStack.getSerial()} ${title}`;

    this.chapter.push({
      index: this.serialStack.getSerialArray(),
      text: _title,
      num: _pageNum,
      level
    });

    this.addText(_title, {
      y: level === 1 ? this.headerHeight : this.y,
      align: level === 1 ? 'center' : 'left',
      fontSize: fontSizeMap[level.toString()]
    });

    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ addChapter: ${(endTime - startTime).toFixed(2)}ms`);

    // 如果是二级标题，需要添加下划线
    // if (level === 2) {
    //   const { endY } = await drawImg(this.pdf, getHeadingUnderlineImg(), {
    //     x: 20,
    //     y: this.y,
    //     width: 100
    //   });
    //   this.y = endY + 10;
    // }
  }

  addCatalog(pageNum = 1): void {
    const startTime = performance.now();
    this.pdf.insertPage(pageNum);
    const { endY } = drawText(this.pdf, TEST_TEXT, {
      align: 'center',
      y: 80,
      fontSize: FONT_SIZE_BASE_H4,
      border: 40,
      pageWidth: this.pageWidth
    });

    drawSection(this.pdf, this.chapter, {
      align: 'center',
      y: endY + 10,
      fontSize: FONT_SIZE_BASE_H6,
      border: 40,
      pageWidth: this.pageWidth
    });
    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ addCatalog: ${(endTime - startTime).toFixed(2)}ms`);
  }

  // async addCover(name: string = TEST_TEXT): Promise<void> {
  //   await drawCover(this.pdf, name);
  // }

  // async addBackCover(): Promise<void> {
  //   await drawBackCover(this.pdf);
  // }

  // TODO 需要拖进来跟内部逻辑一起处理，比如分页
  addText(text: string, config?: TextConfig): void {
    const startTime = performance.now();
    const { endY } = drawText(this.pdf, text, {
      y: this.y,
      border: this.border,
      pageWidth: this.pageWidth,
      ...config
    });

    this.y = endY + this.padding;
    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ addText: ${(endTime - startTime).toFixed(2)}ms`);
  }

  // addSection(text: string, config?: TextConfig & { indent?: boolean }): void {
  //   const { indent = false, fontSize = 0 } = config ?? {};
  //   const indentWidth = indent ? 2 * fontSize : 0;
  //   const textAllWidth = this.pageWidth - 2 * this.border;

  //   const fakerAllText = `xx${text}`;
  //   const lines = this.pdf.splitTextToSize(fakerAllText, textAllWidth);

  //   let y = y0;

  //   lines.forEach((line, idx) => {
  //     const lineX = idx === 0 ? x0 + indent : x0; // 首行缩进，其余顶格
  //     if (idx === 0) {

  //     }

  //     doc.text(line, lineX, y);
  //     y += lineGap;
  //   });
  //   return y; // 方便连续打印多段
  // }

  async addImage(img: string, config?: ImgConfig): Promise<void> {
    const startTime = performance.now();
    const { bottomText } = config || {};
    const { endY } = await drawImg(this.pdf, img, {
      y: this.y,
      headerHeight: this.headerHeight,
      pageWidth: this.pageWidth,
      pageHeight: this.pageHeight,
      addPage: this.addPage.bind(this),
      ...config
    });
    this.y = endY + this.padding;

    // 图片底部文本需要更贴近图片一点，所以回退 5 像素
    if (bottomText) {
      const index = this.serialStack.getImgSerial();
      this.addText(`${index ? `${TEST_TEXT}${index}` : ''} ${bottomText}`, {
        y: this.y - 5,
        fontSize: FONT_SIZE_BASE_H5,
        align: 'center'
      });
    }
    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ addImage: ${(endTime - startTime).toFixed(2)}ms`);
  }

  addTable(tableMessage: TableConfig, title: string): void {
    const startTime = performance.now();
    const index = this.serialStack.getTableSerial();
    const { endY } = drawTable(this.pdf, tableMessage, {
      y: this.y - 5,
      title: `${index ? `${TEST_TEXT}${index}` : ''} ${title}`,
      pageWidth: this.pageWidth
    });

    this.y = endY + this.padding;
    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ addTable: ${(endTime - startTime).toFixed(2)}ms`);
  }

  save(name: string): void {
    const startTime = performance.now();
    this.pdf.save(`${name}.pdf`);
    const endTime = performance.now();
    console.log(`[传统方案] ⏱️ save: ${(endTime - startTime).toFixed(2)}ms`);
  }
}

export interface IHeading {
  type: 'heading';
  data: {
    value: string;
    level: number;
  };
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
    value: string; // 图片URL或base64字符串
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
}

/**
 * 导出pdf文件
 * @param {(IHeading|ITable|IImg|IPage|IText)[]} data 导出数据的数组
 * @param {string} title 导出的文件名，成果物的标题
 * @param {ExportOptions} [options] PDF的配置
 * @returns {Promise<void>} 是否成功导出
 */
export async function exportPdf(
  data: (IHeading | ITable | IImg | IPage | IText)[],
  title: string,
  options: ExportOptions = {
    addBackCover: false
  }
): Promise<void> {
  const startTime = performance.now();
  console.log('\n========== [传统方案] 开始导出 PDF ==========');

  const opts = {
    headerImg: '', // 默认带每页头图，如果需要自定义设置options.headerImg = '图片地址'
    ...options
  };

  const initStartTime = performance.now();
  const pdf = new PDF(opts);
  const initEndTime = performance.now();
  console.log(`[传统方案] ⏱️ 初始化 PDF: ${(initEndTime - initStartTime).toFixed(2)}ms`);

  // 当前页有没有内容，如果没有内容就不需要在添加heading前翻页
  let isEmptyPage = true;

  const renderStartTime = performance.now();
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
          ...item.data.pdfOptions,
          head: Array.isArray(item.data.value.head[0])
            ? item.data.value.head as any
            : [item.data.value.head as (string | number | boolean)[]],
          body: item.data.value.body
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
  const renderEndTime = performance.now();
  console.log(`[传统方案] ⏱️ 渲染内容: ${(renderEndTime - renderStartTime).toFixed(2)}ms`);

  const catalogStartTime = performance.now();
  pdf.addCatalog();
  const catalogEndTime = performance.now();
  console.log(`[传统方案] ⏱️ 添加目录: ${(catalogEndTime - catalogStartTime).toFixed(2)}ms`);

  // await pdf.addCover(title);
  // if (options.addBackCover) {
  //   await pdf.addBackCover();
  // }

  const saveStartTime = performance.now();
  pdf.save(title);
  const saveEndTime = performance.now();
  console.log(`[传统方案] ⏱️ 保存文件: ${(saveEndTime - saveStartTime).toFixed(2)}ms`);

  const endTime = performance.now();
  console.log(`[传统方案] ✅ 导出完成，总耗时: ${(endTime - startTime).toFixed(2)}ms`);
  console.log('=============================================\n');
}

