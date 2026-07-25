// 编译期断言工具：把 shared/contract 里的类型和它在服务端的常量来源绑在一起。
//
// shared/contract 必须零 import（iOS App 要原样拷贝它），所以枚举的常量数组留在
// features 和 shared/domain 里。用下面的 ContractMatches 在原处加一行断言，
// 常量一改而契约没跟上，orbits 就编译不过。
//
// 这个文件本身不属于契约，不会被拷贝到客户端。

// 两个类型必须互相可赋值，也就是完全一致；不一致时求值为 never，
// 在断言位置产生编译错误。
export type ContractMatches<TSource, TContract> = [TSource] extends [TContract]
  ? [TContract] extends [TSource]
    ? true
    : never
  : never;
