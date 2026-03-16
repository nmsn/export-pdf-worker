
const coverImg = '/images/test_cover.png';
const backCoverImg = '/images/test_cover.png';
const headerImg = '/globe.svg';
const headingUnderlineImg = '/file.svg';
import dayjs from 'dayjs';

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
 * 阿拉伯数字转中文数字，暂时只用一位数字就够了
 * @param {number} num 阿拉伯数字
 * @returns {string} 中文数字
 */
const easyCn2An = (num: number): string => {
  if (!Number(num) && (num <= 0 || num > 10)) {
    throw new Error();
  }
  const source = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

  return source[num - 1];
};

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
 * 图片链接转换为HTML IMAGE元素
 * @param {string} src 图片链接
 * @returns {Promise<HTMLImageElement>} HTMLImageElement
 */
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
 * 图片 url 转换为 base64 字符串
 * @param {string} url url
 * @returns {Promise<string>} base64 字符串
 */
async function urlToBase64Async(url: string): Promise<string> {
  const img = await loadImage(url);
  return imageToBase64(img);
}

interface TransformResult {
  base64: string;
  img: HTMLImageElement;
}

/**
 * 传入图片，自动转换base64
 * 输出base64和Image HTML元素
 * @param {string|HTMLImageElement|Blob|Promise<string>} img img数据
 * @returns {Promise<TransformResult>} base64 和 Image HTML 元素
 */
async function transformImageToBase64AndImg(img: string | HTMLImageElement | Blob | Promise<string>): Promise<TransformResult> {
  const startTime = performance.now();
  
  // FIX: 支持Promise
  if (img instanceof Promise) {
    const result = await transformImageToBase64AndImg(await img);
    const endTime = performance.now();
    console.log(`transformImageToBase64AndImg (Promise) 执行时间: ${(endTime - startTime).toFixed(2)}ms`);
    return result;
  }

  let result: TransformResult;
  
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
  console.log(`transformImageToBase64AndImg 执行时间: ${(endTime - startTime).toFixed(2)}ms`);
  return result;
}

/**
 * 获取封面图片
 * @returns {string} 封面图片链接
 */
function getCoverImg(): string {
  return coverImg as unknown as string;
}

/**
 * 获取封底图片
 * @returns {string} 封底图片链接
 */
function getBackCoverImg(): string {
  return backCoverImg as unknown as string;
}

/**
 * 获取标题下划线
 * @returns {string} 标题下划线链接
 */
function getHeadingUnderlineImg(): string {
  return headingUnderlineImg as unknown as string;
}

/**
 * 获取页眉图片
 * @returns {string} 页眉图片链接
 */
function getHeaderImg(): string {
  return headerImg as unknown as string;
}

/**
 * 获取封面创建日期
 * @returns {string} 创建日期
 */
function getCreateDate(): string {
  return `Date: ${dayjs().format('YYYY/MM/DD')}`;
}

/**
 * 拼接特殊的带载图
 * @param {any} top 上面的图片
 * @param {any} left 左边的图片
 * @param {any} center 中间的图片
 * @returns {Promise<string>} 返回base64
 */
type ImageSource = string | HTMLImageElement | Blob | Promise<string>;

async function puzzleLoadDiagram(top: ImageSource, left: ImageSource, center: ImageSource): Promise<string> {
  let topImg: HTMLImageElement | null = null;
  // let topBase64 = null;
  let leftImg: HTMLImageElement | null = null;
  // let leftBase64 = null;
  let centerImg: HTMLImageElement | null = null;
  // let centerBase64 = null;
  if (top) {
    const img = await transformImageToBase64AndImg(top);
    topImg = img.img;
    // topBase64 = img.base64;
  }
  if (left) {
    const img = await transformImageToBase64AndImg(left);
    leftImg = img.img;
    // leftBase64 = img.base64;
  }
  if (center) {
    const img = await transformImageToBase64AndImg(center);
    centerImg = img.img;
    // centerBase64 = img.base64;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const width = topImg
    ? topImg.width
    : (leftImg?.width || 0) + (centerImg?.width || 0);
  const height = leftImg
    ? leftImg.height
    : (topImg?.height || 0) + (centerImg?.height || 0);
  canvas.width = width;
  canvas.height = height;
  if (topImg) {
    ctx!.drawImage(topImg, 0, 0, topImg.width, topImg.height);
  }
  if (leftImg) {
    ctx!.drawImage(leftImg, 0, 0, leftImg.width, leftImg.height);
  }
  if (centerImg) {
    ctx!.drawImage(
      centerImg,
      leftImg?.width || 0,
      topImg?.height || 0,
      centerImg.width,
      centerImg.height
    );
  }
  // 输出base64
  return canvas.toDataURL('image/png');
}

interface TableData {
  head?: (string | number | boolean)[];
  body?: (string | number | boolean)[][];
}

interface ReducedTableData {
  head: (string | number | boolean)[];
  body: (string | number | boolean)[][];
}

/**
 * 如果传入的表格没有表头，则提取表头
 * @param {TableData} tableData 表格数据
 * @returns {ReducedTableData} 提取表头后的表格数据
 */
function reduceTable(tableData: TableData): ReducedTableData {
  if (tableData.head) {
    return tableData as ReducedTableData;
  }
  if (tableData.body && tableData.body.length > 0) {
    return {
      head: tableData.body[0],
      body: tableData.body.slice(1)
    };
  }
  return {
    head: [],
    body: []
  };
}

interface SpecItem {
  specName: string;
  specValue: string;
}

/**
 * 将pisSpec字段拼接为字符串
 * @param {SpecItem[]} spec pisSpec字段
 * @returns {string} 拼接后的字符串
 */
function specToTableData(spec: SpecItem[]): string {
  if (!(Array.isArray(spec) && spec.length)) {
    return '';
  }
  return spec
    .filter((item: SpecItem) => item.specName && item.specValue)
    .map((item: SpecItem) => `${item.specName.trim()}: ${item.specValue.trim()}`)
    .join('\n');
}
interface DocItemValue {
  head?: (string | number | boolean)[];
  body?: (string | number | boolean)[][];
  [key: string]: any;
}

interface DocItemOptions {
  bottomText?: string;
  parOptions?: {
    indent?: {
      firstLine?: number;
    };
  };
  textOptions?: {
    align?: string;
    fontSize?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

interface DocItemPdfOptions {
  fontSize?: number;
  maxWidth?: number;
  [key: string]: any;
}

interface DocItem {
  type: string;
  value?: DocItemValue;
  description?: string;
  options?: DocItemOptions;
  pdfOptions?: DocItemPdfOptions;
  docData?: DocItem[];
  checkType?: string;
  title?: string;
  children?: DocItem[];
}

/**
 * 将内容转换为插件所需要的格式
 * @param {Array} data 原数据
 * @param {Array} contentCheckedList 选择项
 * @returns {Array} 转换的数据
 */
interface DocContentDataItem {
  type: string;
  data?: {
    value?: DocItemValue | string;
    title?: string;
    level?: number;
    options?: DocItemOptions;
    pdfOptions?: DocItemPdfOptions;
  };
  docData?: DocContentDataItem[];
  pdfOptions?: {
    fontSize?: number;
    maxWidth?: number;
    bottomText: string;
  }
}

function getDocContentData(data: DocItem[] = [], contentCheckedList: string[] = []): DocContentDataItem[] {
  const result: DocContentDataItem[] = [];
  data.forEach((it: DocItem) => {
    if (it?.type === 'table') {
      // 确保it.value存在且有head和body属性
      const head = it.value?.head ?? [];
      const body = it.value?.body ?? [];

      result.push({
        type: 'table',
        data: {
          value: {
            head: Array.isArray(head[0]) ? head : [head] as any[],
            body: body
          },
          title: it.description || '',
          // FIX：注释列不会自动换行，如果有注释的话，指定最大列宽度
          // 这个值表示第5列的宽度
          pdfOptions: { ...it?.pdfOptions }
        }
      });
    } else if (it?.type === 'img') {
      result.push({ type: it.type, data: { value: it.value, options: { bottomText: it.description || '', ...it.options } }, pdfOptions: { bottomText: it.description || '', ...it?.pdfOptions } });
    } else if (it.type === 'heading') {
      if (it.docData && it?.docData?.length) {
        if (contentCheckedList.includes(it.checkType || '')) {
          result.push({ type: "heading", data: { value: it.value || '', level: 3 } });
          result.push(...getDocContentData(it.docData, contentCheckedList));
        }
      } else {
        result.push({ type: "heading", data: { value: (it.value || '') as string, level: 3 } });
      }
    } else {
      result.push({
        type: it.type,
        data: {
          value: it.value,
          options: {
            parOptions: {
              indent: {
                firstLine: 400 // 单位是Twips，1 Twip = 1/20 点，大约1/1440 英寸
              }
            },
            textOptions: {
              align: 'center',
              fontSize: 14,
              ...it.options
            }
          },
          pdfOptions: {
            fontSize: 12,
            maxWidth: 400
          }
        }
      });
    }
  });
  return result;
}
interface FormData {
  name?: string;
  contentCheckedList?: string[];
}

/**
 * 生成数据模版
 * @param {Array} preData 需要生成的数据
 * @param {Object} formData 方案和已选类型
 * @returns {Array} 导出组件接受的数据数组
 */
function getDataTemplate(preData: DocItem[] = [], formData: FormData = {}): DocContentDataItem[] {
  const { contentCheckedList = [] } = formData;
  const documentData: DocContentDataItem[] = [];

  preData?.forEach((item: DocItem) => {
    if ((item.checkType && contentCheckedList.includes(item.checkType)) || !item.checkType) {
      if (item.type && item.type === 'sceneCover') {
        documentData.push({ type: item.type, docData: getDocContentData(item?.docData || [], contentCheckedList) });
      } else {
        //是否渲染标题 内容为空时不渲染标题
        const isRenderTitle = item?.children?.filter((ele: DocItem) => (ele.checkType && contentCheckedList.includes(ele.checkType)) || !ele.checkType) || [];
        if (isRenderTitle.length) {
          documentData.push({ type: "heading", data: { value: item.title || '', level: 1 } });
        }
        const dataLength = documentData.length;//记录数据长度用于判断是否渲染标题
        if (item?.children?.length) {
          item?.children?.forEach((childItem: DocItem) => {
            if ((childItem.checkType && contentCheckedList.includes(childItem.checkType)) || !childItem.checkType) {
              if (childItem?.docData?.length) {
                const data = getDocContentData(childItem?.docData || [], contentCheckedList);
                if (data.length) {
                if (childItem.title) {
                  documentData.push({ type: "heading", data: { value: childItem.title || '', level: 2 } });
                }
                  documentData.push(...data);
                }
              } else {
                if (childItem.title) {
                  documentData.push({ type: "heading", data: { value: childItem.title || '', level: 2 } });
                } 
                documentData.push({ type: 'text', data: { value: '  ' } });//没内容时候补充一个text 避免标题重合
              }
            }
          });
        }
        //没有渲染标题的时候不渲染标题
        if (dataLength === documentData.length) {
          documentData.pop();
        }
      }
    }
  });
  return documentData;
}
export {
  easyCn2An,
  createSerialStack,
  transformImageToBase64AndImg,
  getCoverImg,
  getBackCoverImg,
  getHeaderImg,
  getHeadingUnderlineImg,
  getCreateDate,
  puzzleLoadDiagram,
  reduceTable,
  specToTableData,
  getDataTemplate
};