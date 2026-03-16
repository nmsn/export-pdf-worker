# PDF Worker 性能优化方案

## 1. 问题分析

### 1.1 当前架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         主线程                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ 指令收集     │ -> │ 图片转换     │ -> │ Worker通信   │         │
│  │ (轻量)      │    │ (耗时!)     │    │ (轻量)      │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (传输 base64 数据，大数据量)
┌─────────────────────────────────────────────────────────────────┐
│                         Worker 线程                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ 加载jsPDF   │ -> │ 渲染指令     │ -> │ 输出PDF     │         │
│  │ (开销)      │    │ (轻量)      │    │ (轻量)      │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 性能瓶颈

| 操作 | 执行位置 | 耗时占比 | 问题 |
|------|---------|---------|------|
| 图片加载 + 解码 | 主线程 | ~40% | 阻塞主线程 |
| 图片转 base64 | 主线程 | ~30% | 阻塞主线程，生成大数据 |
| Worker 通信 | 主线程↔Worker | ~10% | base64 数据量大，序列化慢 |
| PDF 渲染 | Worker | ~15% | 相对轻量 |
| PDF 合并 | 主线程 | ~5% | pdf-lib 操作 |

### 1.3 核心问题

1. **图片处理在主线程**：最耗时的操作阻塞了 UI 响应
2. **大数据传输**：base64 字符串体积约为原始图片的 1.37 倍，传输开销大
3. **伪并行**：Worker 只执行轻量操作，无法发挥并行优势

---

## 2. 方案对比

### 2.1 方案一：图片预处理 Worker

**思路**：将图片加载和 base64 转换移到独立的 Worker。

```
主线程: 收集指令 -> 发送图片URL -> 接收base64 -> 传输给渲染Worker
图片Worker: 加载图片 -> 转base64 -> 返回
渲染Worker: 渲染PDF
```

| 优点 | 缺点 |
|------|------|
| 图片处理不阻塞主线程 | 仍需传输 base64 大数据 |
| 实现相对简单 | Worker 通信开销可能抵消收益 |
| | Canvas API 需要 OffscreenCanvas 支持 |

**评估**：⭐⭐⭐ 中等优先级

---

### 2.2 方案二：完全 Worker 化

**思路**：所有操作都在 Worker 中完成，主线程只负责触发和接收结果。

```
主线程: 触发导出 -> 等待结果 -> 下载
Worker: 收集指令 + 加载图片 + 渲染PDF + 合并
```

| 优点 | 缺点 |
|------|------|
| 主线程几乎无阻塞 | jsPDF 在 Worker 中兼容性问题 |
| 架构简洁 | 大量代码需要在 Worker 环境运行 |
| | DOM API 无法使用（如 Image、Canvas） |

**评估**：⭐⭐ 低优先级（兼容性问题多）

---

### 2.3 方案三：ImageBitmap + Transferable（推荐）

**思路**：使用 `createImageBitmap` 创建 ImageBitmap，通过 Transferable 零拷贝传输到 Worker，Worker 内部处理图片转换和 PDF 渲染。

```
主线程: 收集指令 -> fetch图片 -> 创建ImageBitmap -> Transferable传输
Worker: 接收ImageBitmap -> OffscreenCanvas转base64 -> 渲染PDF
```

| 优点 | 缺点 |
|------|------|
| 零拷贝传输，高效 | 需要浏览器支持 ImageBitmap |
| 图片解码并行化 | 代码改动较大 |
| 充分利用 Worker 并行 | |

**评估**：⭐⭐⭐⭐⭐ 高优先级（最佳方案）

---

### 2.4 方案四：混合优化方案（最终推荐）

**思路**：结合方案一和方案三，根据图片类型选择最优处理路径。

```
┌─────────────────────────────────────────────────────────────────┐
│                         主线程                                   │
│  ┌─────────────┐                                                │
│  │ 收集指令     │ -> 识别图片类型                                  │
│  └─────────────┘                                                │
│         │                                                       │
│         ├── 本地图片URL -> fetch -> ImageBitmap -> Transferable  │
│         │                                                       │
│         └── 远程图片URL -> 发送URL给图片Worker                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      图片处理 Worker                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ fetch图片   │ -> │ ImageBitmap │ -> │ 压缩/裁剪    │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                              │                                  │
│                              ▼ Transferable (零拷贝)            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PDF 渲染 Worker                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ 接收Bitmap  │ -> │ OffscreenCanvas │ -> │ 渲染PDF     │         │
│  │            │    │ 转base64    │    │            │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

**评估**：⭐⭐⭐⭐⭐ 最佳方案

---

## 3. 最终方案详解

### 3.1 架构设计

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              主线程                                        │
│                                                                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │ PDFWorker    │    │ 图片预加载    │    │ Worker协调   │               │
│  │ 指令收集      │    │ 管理        │    │            │               │
│  └──────────────┘    └──────────────┘    └──────────────┘               │
│         │                   │                   │                        │
│         │                   ▼                   │                        │
│         │          ┌──────────────┐             │                        │
│         │          │ 图片URL队列  │             │                        │
│         │          └──────────────┘             │                        │
│         │                   │                   │                        │
└─────────┼───────────────────┼───────────────────┼────────────────────────┘
          │                   │                   │
          │                   ▼                   │
          │    ┌─────────────────────────────┐    │
          │    │    图片处理 Worker Pool       │    │
          │    │  ┌─────┐ ┌─────┐ ┌─────┐    │    │
          │    │  │ W1  │ │ W2  │ │ W3  │    │    │
          │    │  └─────┘ └─────┘ └─────┘    │    │
          │    │  - fetch 图片                │    │
          │    │  - createImageBitmap         │    │
          │    │  - 压缩/裁剪 (可选)           │    │
          │    │  - Transferable 返回         │    │
          │    └─────────────────────────────┘    │
          │                   │                   │
          │                   ▼                   │
          │         ImageBitmap[] (零拷贝)         │
          │                   │                   │
          ▼                   ▼                   ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                    PDF 渲染 Worker Pool                      │
    │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
    │  │  Page1  │ │  Page2  │ │  Page3  │ │  Page4  │           │
    │  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
    │                                                              │
    │  每个 Worker 处理一页:                                        │
    │  1. 接收 ImageBitmap 指令                                    │
    │  2. OffscreenCanvas 转 base64                                │
    │  3. jsPDF 渲染文本/图片/表格                                  │
    │  4. 输出 ArrayBuffer                                         │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼ ArrayBuffer[]
    ┌─────────────────────────────────────────────────────────────┐
    │                       PDF 合并                               │
    │  pdf-lib 合并所有页面的 PDF                                  │
    └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
    ┌─────────────────────────────────────────────────────────────┐
    │                       下载文件                               │
    └─────────────────────────────────────────────────────────────┘
```

### 3.2 核心技术点

#### 3.2.1 ImageBitmap + Transferable

```typescript
// 主线程：创建 ImageBitmap
const response = await fetch(imageUrl);
const blob = await response.blob();
const imageBitmap = await createImageBitmap(blob);

// 传输到 Worker（零拷贝）
worker.postMessage({ type: 'image', bitmap: imageBitmap }, [imageBitmap]);
// 注意：传输后主线程的 imageBitmap 将不可用
```

#### 3.2.2 OffscreenCanvas 在 Worker 中转 base64

```typescript
// Worker 中：ImageBitmap 转 base64
function imageBitmapToBase64(bitmap: ImageBitmap): string {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  
  // 转换为 Blob，再转 base64
  return new Promise((resolve) => {
    canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
  });
}
```

#### 3.2.3 Worker Pool 管理

```typescript
class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: Task[] = [];
  private availableWorkers: Worker[] = [];

  constructor(workerScript: string, poolSize: number) {
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(workerScript);
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  async execute<T>(task: (worker: Worker) => Promise<T>): Promise<T> {
    const worker = this.availableWorkers.pop() || await this.waitForAvailable();
    try {
      return await task(worker);
    } finally {
      this.availableWorkers.push(worker);
    }
  }

  private waitForAvailable(): Promise<Worker> {
    return new Promise(resolve => {
      this.taskQueue.push(resolve);
    });
  }
}
```

### 3.3 数据流设计

#### 3.3.1 指令类型定义

```typescript
// 图片指令（使用 ImageBitmap）
interface ImageInstructionV2 {
  type: 'image';
  bitmapIndex: number;  // 引用预加载的 ImageBitmap 索引
  x: number;
  y: number;
  width: number;
  height: number;
}

// 文本指令
interface TextInstruction {
  type: 'text';
  content: string;
  x: number;
  y: number;
  fontSize: number;
  align?: 'left' | 'center' | 'right';
  maxWidth?: number;
}

// 表格指令
interface TableInstruction {
  type: 'table';
  head: (string | number | boolean)[][];
  body: (string | number | boolean)[][];
  startY: number;
  // ... 样式配置
}

type DrawInstruction = TextInstruction | ImageInstructionV2 | TableInstruction;
```

#### 3.3.2 Worker 通信协议

```typescript
// 图片 Worker 消息
interface ImageWorkerMessage {
  type: 'process';
  images: { url: string; index: number }[];
}

interface ImageWorkerResult {
  type: 'result';
  bitmaps: { index: number; bitmap: ImageBitmap }[];
}

// PDF Worker 消息
interface PDFWorkerMessage {
  type: 'render';
  pageIndex: number;
  instructions: DrawInstruction[];
  imageBitmaps: ImageBitmap[];  // 预加载的图片
}

interface PDFWorkerResult {
  type: 'result';
  pageIndex: number;
  buffer: ArrayBuffer;
}
```

### 3.4 性能优化点

| 优化项 | 原方案 | 新方案 | 预期提升 |
|--------|--------|--------|---------|
| 图片加载 | 主线程同步 | Worker 并行 | 50-70% |
| 数据传输 | base64 字符串 | ImageBitmap + Transferable | 80%+ |
| 主线程阻塞 | 70%+ | <10% | 显著 |
| 内存占用 | base64 副本 | 零拷贝 | 50%+ |

### 3.5 浏览器兼容性

| API | Chrome | Firefox | Safari | Edge |
|-----|--------|---------|--------|------|
| createImageBitmap | ✅ 50+ | ✅ 42+ | ✅ 11+ | ✅ 79+ |
| OffscreenCanvas | ✅ 69+ | ✅ 105+ | ✅ 16.4+ | ✅ 79+ |
| Transferable | ✅ 全部 | ✅ 全部 | ✅ 全部 | ✅ 全部 |

**建议**：对于不支持 OffscreenCanvas 的浏览器，降级为传统方案。

---

## 4. 实现计划

### 4.1 阶段一：基础设施（1-2天）

1. 创建图片处理 Worker（复用 `image-compressor.js`）
2. 实现 Worker Pool 管理类
3. 添加兼容性检测和降级逻辑

### 4.2 阶段二：指令收集改造（2-3天）

1. 修改 `PDFWorker` 类，支持 ImageBitmap 索引
2. 实现图片预加载流程
3. 改造 `collectImageInstructions` 函数

### 4.3 阶段三：Worker 渲染改造（2-3天）

1. PDF Worker 支持 ImageBitmap 输入
2. 实现 OffscreenCanvas 转 base64
3. 优化 Worker 通信协议

### 4.4 阶段四：测试与优化（1-2天）

1. 性能对比测试
2. 兼容性测试
3. 内存泄漏检查

---

## 5. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| 浏览器兼容性 | 部分用户无法使用 | 检测兼容性，降级为传统方案 |
| Worker 通信开销 | 性能提升不达预期 | 批量传输，减少消息数量 |
| 内存泄漏 | 长时间使用崩溃 | 及时 close ImageBitmap |
| 图片跨域 | 部分图片无法加载 | 服务端代理或 CORS 配置 |

---

## 6. 附录

### 6.1 现有代码复用

项目已有 `public/workers/image-compressor.js`，可以直接复用：
- `createImageBitmap` 创建位图
- `OffscreenCanvas` 图片压缩
- `Transferable` 零拷贝传输

### 6.2 参考资料

- [MDN: createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap)
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [MDN: Transferable](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [Web Workers Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
