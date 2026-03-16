import greenlet from 'greenlet'

// 定义一个计算密集型的异步函数
// const heavyComputation = greenlet(async (data) => {
//   // 这里的代码将在独立线程中运行
//   let result = 0;
//   for (let i = 0; i < data.length; i++) {
//     result += Math.sqrt(data[i]);
//   }
//   return result;
// });



// // 调用时不会阻塞主线程
// heavyComputation([1, 2, 3, 4, 5]).then(result => {
//   console.log('计算结果:', result);
// });
export const longFunc = async (input: number) => {
  // 模拟耗时5秒的计算任务
  const startTime = Date.now();
  let result = 0;

  // 执行大量计算直到5秒过去
  while (Date.now() - startTime < 5000) {
    for (let i = 0; i < 1000000; i++) {
      result += Math.sqrt(input + i) * Math.random();
    }
  }

  return Math.round(result);
};


// 新增一个需要执行5秒的async函数
const longRunningTask = greenlet(longFunc);

export const longFuncInWorker = async () => {
  // 测试是不是异步效果
  console.warn('start');
  const result = await longRunningTask(42);
  console.warn('end')
  return result;
};
