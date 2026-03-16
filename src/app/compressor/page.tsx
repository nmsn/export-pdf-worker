'use client';

import { useState } from 'react';
import { compressImage } from '@/lib/compressor';

export default function CompressorPage() {
  const [loading, setLoading] = useState(false);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [compressedImage, setCompressedImage] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<{
    originalSize: number;
    compressedSize: number;
    width: number;
    height: number;
    compressionRatio: string;
  } | null>(null);
  const [maxWidth, setMaxWidth] = useState(800);
  const [maxHeight, setMaxHeight] = useState(600);
  const [quality, setQuality] = useState(0.8);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    
    try {
      // 将文件转换为 base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Data = e.target?.result as string;
        setOriginalImage(base64Data);
        try {
          // 使用 utils 中的 compressImage 进行压缩
          const result = await compressImage({
            imageData: base64Data,
            maxWidth,
            maxHeight,
            quality,
            outputFormat: 'image/jpeg'
          });

          // 将压缩后的数据转换为 base64 显示
          const compressedBase64 = `data:image/jpeg;base64,${arrayBufferToBase64(result.data)}`;
          setCompressedImage(compressedBase64);
          
          setImageInfo({
            originalSize: result.originalSize,
            compressedSize: result.compressedSize,
            width: result.width,
            height: result.height,
            compressionRatio: result.compressionRatio
          });
        } catch (error) {
          console.error('压缩失败:', error);
          alert('压缩失败: ' + (error as Error).message);
        } finally {
          setLoading(false);
        }
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('文件读取失败:', error);
      setLoading(false);
    }
  };

  // 将 ArrayBuffer 转换为 base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const downloadCompressedImage = () => {
    if (!compressedImage) return;
    
    const link = document.createElement('a');
    link.href = compressedImage;
    link.download = 'compressed-image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-xl rounded-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              图片压缩工具
            </h1>
            <p className="text-lg text-gray-600">
              上传图片进行压缩，支持自定义压缩参数
            </p>
          </div>

          {/* 压缩参数设置 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                最大宽度: {maxWidth}px
              </label>
              <input
                type="range"
                min="100"
                max="2000"
                value={maxWidth}
                onChange={(e) => setMaxWidth(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                最大高度: {maxHeight}px
              </label>
              <input
                type="range"
                min="100"
                max="2000"
                value={maxHeight}
                onChange={(e) => setMaxHeight(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                质量: {quality}
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* 文件上传 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择图片
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              disabled={loading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>

          {loading && (
            <div className="text-center py-4">
              <div className="inline-flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                压缩中...
              </div>
            </div>
          )}

          {/* 图片对比 */}
          {originalImage && compressedImage && imageInfo && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">原始图片</h3>
                <img 
                  src={originalImage} 
                  alt="原始图片"
                  className="w-full h-auto rounded-lg border border-gray-300"
                  style={{ maxHeight: '300px', objectFit: 'contain' }}
                />
                <div className="mt-2 text-sm text-gray-600">
                  <p>大小: {formatBytes(imageInfo.originalSize)}</p>
                </div>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">压缩后图片</h3>
                <img 
                  src={compressedImage} 
                  alt="压缩后图片"
                  className="w-full h-auto rounded-lg border border-gray-300"
                  style={{ maxHeight: '300px', objectFit: 'contain' }}
                />
                <div className="mt-2 text-sm text-gray-600">
                  <p>大小: {formatBytes(imageInfo.compressedSize)}</p>
                  <p>尺寸: {imageInfo.width} × {imageInfo.height}</p>
                  <p>压缩率: {(Number(imageInfo.compressionRatio) * 100).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          )}

          {/* 压缩信息 */}
          {imageInfo && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-md font-semibold text-blue-900 mb-2">压缩统计</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">原始大小:</span>
                  <div className="font-semibold">{formatBytes(imageInfo.originalSize)}</div>
                </div>
                <div>
                  <span className="text-blue-700">压缩后大小:</span>
                  <div className="font-semibold">{formatBytes(imageInfo.compressedSize)}</div>
                </div>
                <div>
                  <span className="text-blue-700">压缩率:</span>
                  <div className="font-semibold">{(Number(imageInfo.compressionRatio) * 100).toFixed(1)}%</div>
                </div>
                <div>
                  <span className="text-blue-700">节省空间:</span>
                  <div className="font-semibold">
                    {formatBytes(imageInfo.originalSize - imageInfo.compressedSize)}
                  </div>
                </div>
              </div>
              
              {compressedImage && (
                <button
                  onClick={downloadCompressedImage}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  下载压缩图片
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}