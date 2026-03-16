import * as Comlink from 'comlink';

// 在 Worker 中动态加载 jspdf
async function loadJsPdf() {
  if (!(self as any).jsPDF) {
    // 等待 jspdf 在 Worker 中被加载
    // 使用 importScripts 无法在 TypeScript 中直接使用，因此在创建 Worker 时注入
  }
}

interface PDFRenderer {
  renderPage(
    instructions: any[],
    pageSize: string,
    imageDataMap: Record<number, Uint8Array>
  ): Promise<ArrayBuffer>;
}

const pdfRenderer: PDFRenderer = {
  async renderPage(
    instructions: any[],
    pageSize: string,
    imageDataMap: Record<number, Uint8Array>
  ): Promise<ArrayBuffer> {
    // 在 Worker 中需要使用 self 而不是 window
    const jsPDF = (self as any).jsPDF;
    if (!jsPDF) {
      throw new Error('jsPDF not available in Worker');
    }
    
    const doc = new jsPDF('p', 'px', pageSize);

    // 将 Uint8Array 转换为 base64
    const uint8ArrayToBase64 = (uint8Array: Uint8Array): string => {
      let binary = '';
      const len = uint8Array.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      return 'data:image/jpeg;base64,' + btoa(binary);
    };

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
        (doc as any).autoTable({
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