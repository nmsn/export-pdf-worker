// PDF Worker - 在 Web Worker 中使用 jsPDF 创建 PDF
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
importScripts('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');

// 获取 jsPDF
const jsPDF = self.jspdf.jsPDF;

// 监听主线程消息
self.onmessage = function(e) {
  const { type, data } = e.data;
  if (type === 'createPDF') {
    try {
      // 创建 PDF 文档
      const doc = new jsPDF();

      // 添加标题
      doc.setFontSize(20);
      doc.text('Web Worker PDF 示例', 20, 30);

      // 添加副标题
      doc.setFontSize(14);
      doc.text('通过 Web Worker 生成的 PDF 文件', 20, 50);

      // 添加当前时间
      doc.setFontSize(12);
      const now = new Date().toLocaleString('zh-CN');
      doc.text(`生成时间: ${now}`, 20, 70);

      // 添加表格
      doc.setFontSize(16);
      doc.text('销售数据表', 20, 90);

      // 表格数据
      const tableData = [
        ['产品', '销量', '单价', '总额'],
        ['iPhone 15', '120', '5999', '719880'],
        ['MacBook Pro', '85', '12999', '1104915'],
        ['iPad Air', '200', '4599', '919800'],
        ['Apple Watch', '150', '2999', '449850'],
        ['AirPods', '300', '1299', '389700']
      ];

      // 使用 autoTable 绘制表格
      doc.autoTable({
        head: [tableData[0]],
        body: tableData.slice(1),
        startY: 100,
        theme: 'grid',
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255,
          fontSize: 12,
          fontStyle: 'bold'
        },
        bodyStyles: {
          fontSize: 10
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        margin: { top: 10, right: 20, bottom: 30, left: 20 }
      });

      // 添加总计信息
      const finalY = doc.lastAutoTable.finalY + 20;
      doc.setFontSize(12);
      doc.text('总计: 3,580,145 元', 20, finalY);

      // 获取 PDF 数据
      const pdfData = doc.output('arraybuffer');

      // 发送结果回主线程
      self.postMessage({
        type: 'pdfCreated',
        data: pdfData
      });

    } catch (error) {
      self.postMessage({
        type: 'error',
        error: error.message
      });
    }
  }
};
