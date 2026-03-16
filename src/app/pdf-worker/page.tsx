'use client';

import { useState, useEffect, useRef } from 'react';

export default function PDFWorkerPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('等待操作');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    // 创建 Web Worker
    if (typeof window !== 'undefined' && !workerRef.current) {
      // 使用 public 目录下的 worker.js
      const newWorker = new Worker('/workers/worker.js');
      
      newWorker.onmessage = (e) => {
        const { type, data, error } = e.data;
        if (type === 'pdfCreated') {
          const blob = new Blob([data], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setDownloadUrl(url);
          setStatus('PDF 生成完成');
          setLoading(false);
        } else if (type === 'error') {
          setStatus(`错误: ${error}`);
          setLoading(false);
        }
      };

      newWorker.onerror = (error) => {
        console.error('Worker error:', error);
        setStatus('Worker 错误');
        setLoading(false);
      };

      workerRef.current = newWorker;
    }

    // 清理函数
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  const handleCreatePDF = () => {
    if (!workerRef.current) {
      setStatus('Worker 未初始化');
      return;
    }

    setLoading(true);
    setStatus('正在生成 PDF...');
    setDownloadUrl(null);
    // 发送消息到 Worker
    workerRef.current.postMessage({
      type: 'createPDF',
      data: {}
    });
  };

  const handleDownload = () => {
    if (downloadUrl) {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `web-worker-pdf-${new Date().getTime()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePreview = () => {
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white shadow-xl rounded-lg p-8">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Web Worker PDF 表格生成器
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              使用 Web Worker 在后台生成带表格的 PDF 文件，不会阻塞主线程
            </p>

            {/* 状态显示 */}
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-900">
                当前状态: {status}
              </p>
            </div>

            {/* 主按钮 */}
            <button
              onClick={handleCreatePDF}
              disabled={loading}
              className="w-full inline-flex items-center justify-center px-6 py-3 mb-4 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  生成中...
                </>
              ) : (
                '生成 PDF'
              )}
            </button>

            {/* 操作按钮组 */}
            {downloadUrl && (
              <div className="space-y-3">
                <button
                  onClick={handleDownload}
                  className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 11115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  下载 PDF
                </button>

                <button
                  onClick={handlePreview}
                  className="w-full inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="-ml-1 mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  预览 PDF
                </button>
              </div>
            )}

            {/* 说明信息 */}
            <div className="mt-6 text-sm text-gray-500">
              <p className="mb-2">
                <strong>功能特点：</strong>
              </p>
              <ul className="text-left space-y-1">
                <li>• 使用 Web Worker 在后台线程生成 PDF</li>
                <li>• 不阻塞主线程，界面保持响应</li>
                <li>• 支持中文显示和表格</li>
                <li>• 集成 jspdf-autotable 插件</li>
                <li>• 实时状态反馈</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}