import Link from "next/link";

export default function Home() {
  const modules = [
    {
      title: "PDF 导出",
      description: "导出 PDF 文档，支持标题、图片、表格",
      href: "/pdf",
      icon: "📄",
    },
    {
      title: "图片压缩",
      description: "客户端图片压缩工具，支持自定义参数",
      href: "/compressor",
      icon: "🖼️",
    },
    {
      title: "Greenlet 测试",
      description: "测试 Web Worker 异步处理能力",
      href: "/greenlet",
      icon: "⚡",
    },
    {
      title: "图片 Worker",
      description: "图片处理的 Web Worker 演示",
      href: "/img-worker",
      icon: "🔧",
    },
    {
      title: "PDF Worker",
      description: "PDF 生成的 Web Worker 演示",
      href: "/pdf-worker",
      icon: "📑",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            文档导出工具
          </h1>
          <p className="text-lg text-gray-600">
            支持 PDF 和 Word 文档导出，图片压缩等功能的演示项目
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {modules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="block p-6 bg-white rounded-lg border border-gray-200 shadow-md hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{module.icon}</span>
                <h2 className="text-xl font-semibold text-gray-900">
                  {module.title}
                </h2>
              </div>
              <p className="text-gray-600">{module.description}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            基于 Next.js 16 + React 19 + Tailwind CSS
          </p>
        </div>
      </div>
    </div>
  );
}
