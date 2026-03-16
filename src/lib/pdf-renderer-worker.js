// pdf-renderer-worker.js
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