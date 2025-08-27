# ETH-USDT 流动性池 (AMM)

基于恒定乘积公式 (x×y=k) 的 ETH/USDT 自动做市商流动性池。

## 功能特性

- **恒定乘积公式**: 使用经典的 AMM 公式 x×y=k 进行价格发现
- **流动性管理**: 支持添加和移除流动性，按比例分配收益
- **代币交换**: 支持 ETH ⇄ USDT 双向交换
- **手续费机制**: 每笔交易收取 0.3% 手续费分配给流动性提供者
- **LP 代币**: 发行流动性提供证明代币

## 合约架构

### USDT.sol
ERC20 代币合约，模拟 USDT 代币（6位小数）

### LiquidityPool.sol
核心流动性池合约，实现：
- 添加/移除流动性
- ETH/USDT 交换
- 价格计算
- LP 代币管理

## 快速开始

### 安装依赖
```bash
npm install
```

### 编译合约
```bash
npm run compile
```

### 运行测试
```bash
npm run test
```

### 启动本地节点
```bash
npm run node
```

### 部署到本地网络
```bash
npm run deploy:localhost
```

## 使用方法

### 1. 添加流动性
```solidity
// 批准代币转账
usdt.approve(liquidityPoolAddress, tokenAmount);

// 添加流动性 (需要发送 ETH)
liquidityPool.addLiquidity(tokenAmount, {value: ethAmount});
```

### 2. 移除流动性
```solidity
// 移除流动性
liquidityPool.removeLiquidity(lpTokenAmount);
```

### 3. 交换代币
```solidity
// ETH 换 USDT
liquidityPool.swapETHForTokens(minTokensOut, {value: ethAmount});

// USDT 换 ETH
usdt.approve(liquidityPoolAddress, tokenAmount);
liquidityPool.swapTokensForETH(tokenAmount, minETHOut);
```

## 核心公式

### 恒定乘积公式
```
x × y = k
```
其中：
- x = ETH 储备量
- y = USDT 储备量  
- k = 恒定值

### 交换价格计算（含手续费）
```
输出量 = (输入量 × 997 × 输出储备) / (输入储备 × 1000 + 输入量 × 997)
```

### 流动性计算
```
初始流动性 = √(ethAmount × tokenAmount) - MINIMUM_LIQUIDITY
后续流动性 = min(ethAmount × totalSupply / ethReserve, tokenAmount × totalSupply / tokenReserve)
```

## 测试覆盖

- 合约部署验证
- 流动性添加/移除
- 代币交换功能
- 价格计算准确性
- 恒定乘积公式验证
- 边界条件测试

## 安全特性

- **重入攻击保护**: 使用 ReentrancyGuard
- **溢出保护**: 使用 OpenZeppelin 的 Math 库
- **最小流动性**: 防止流动性耗尽攻击
- **滑点保护**: 支持最小输出量设置

## 许可证

MIT License
