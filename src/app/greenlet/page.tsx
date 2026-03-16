'use client';

import { useState } from 'react';
import { longFuncInWorker, longFunc } from '@/lib/greenlet';
import { jsPDF } from 'jspdf';
export default function GreenletPage() {
  const [result, setResult] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const handleCalc = async () => {
    // setLoading(true);
    // try {
    //   const res = await longFuncInWorker();
    //   // const res = await longFunc(42);
    //   setResult(res);
    // } catch (error) {
    //   console.error('测试失败:', error);
    // } finally {
    //   setLoading(false);
    // }

    const doc = new jsPDF();
    doc.text("Hello, world!", 10, 10);
    doc.save("test.pdf");
  };


  const onInput = (e) => {
    setInputValue(e.target.value);
    console.log(e.target.value);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Greenlet 测试页面</h1>
      <p>点击按钮执行耗时5秒的异步计算任务</p>

      <input
        type="text"
        value={inputValue}
        onChange={onInput}
        placeholder="输入测试文字，检查是否卡顿..."
        style={{
          width: '100%',
          padding: '10px',
          fontSize: '16px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          marginBottom: '15px'
        }}
      />

      <button
        onClick={handleCalc}
        disabled={loading}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? '计算中...' : '开始计算'}
      </button>

      {result !== null && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f0f0f0', borderRadius: '4px' }}>
          <h3>计算结果:</h3>
          <p>{result}</p>
        </div>
      )}
    </div>
  );
}