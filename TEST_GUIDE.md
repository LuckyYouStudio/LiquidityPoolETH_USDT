# 🧪 ETH-USDT 流动性池测试指南

## 📋 快速开始

### 1. 确保本地节点正在运行
```bash
# 在终端1中运行
npm run node
```

### 2. 部署合约（如果还未部署）
```bash
# 在终端2中运行
npm run deploy:localhost
```

### 3. 启动交互式测试
```bash
# 运行测试菜单
npm run test:menu
```

## 🎮 交互式测试菜单功能

### 主要功能：
1. **📊 查看池子状态** - 查看当前流动性、价格、储备量
2. **💧 添加流动性** - 向池子添加 ETH 和 USDT
3. **💸 移除流动性** - 燃烧 LP 代币取回资产
4. **🔄 ETH 换 USDT** - 用 ETH 交换 USDT
5. **🔄 USDT 换 ETH** - 用 USDT 交换 ETH
6. **🧮 价格计算器** - 计算交换预期输出
7. **🎁 获取测试代币** - 获取测试用 USDT
8. **🔄 刷新账户信息** - 更新余额显示

## 📝 测试场景示例

### 场景 1: 初始化流动性池
```
1. 运行测试菜单
2. 选择 "2. 添加流动性"
3. 输入: 10 ETH, 30000 USDT
4. 确认交易
```

### 场景 2: 测试交换功能
```
1. 选择 "4. ETH 换 USDT"
2. 输入: 1 ETH
3. 设置滑点: 1%
4. 查看实际获得的 USDT
```

### 场景 3: 测试套利场景
```
1. 大额交换改变价格
2. 观察价格变化
3. 反向交换获利
```

### 场景 4: 测试流动性挖矿
```
1. 添加流动性获得 LP 代币
2. 其他用户交易产生手续费
3. 移除流动性获得收益
```

## 🔧 命令行测试

### 使用 Hardhat Console
```bash
# 启动控制台
npx hardhat console --network localhost

# 在控制台中
const pool = await ethers.getContractAt("LiquidityPool", "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512")
const usdt = await ethers.getContractAt("USDT", "0x5FbDB2315678afecb367f032d93F642f64180aa3")

// 查看储备
await pool.getReserves()

// 计算价格
await pool.getAmountOut(ethers.parseEther("1"), ethers.parseEther("10"), ethers.parseUnits("30000", 6))
```

### 直接运行脚本
```bash
# 运行完整交互流程
npx hardhat run scripts/interact.js --network localhost

# 运行测试套件
npm test
```

## 📊 监控工具

### 查看实时状态
```javascript
// scripts/monitor.js
const pool = await ethers.getContractAt("LiquidityPool", POOL_ADDRESS);

// 监听事件
pool.on("Swap", (user, ethIn, tokenIn, ethOut, tokenOut) => {
    console.log(`交换事件: ${user}`);
    if(ethIn > 0) console.log(`  ETH→USDT: ${ethers.formatEther(ethIn)} → ${ethers.formatUnits(tokenOut, 6)}`);
    if(tokenIn > 0) console.log(`  USDT→ETH: ${ethers.formatUnits(tokenIn, 6)} → ${ethers.formatEther(ethOut)}`);
});

pool.on("AddLiquidity", (provider, ethAmount, tokenAmount, liquidity) => {
    console.log(`添加流动性: ${provider}`);
    console.log(`  ${ethers.formatEther(ethAmount)} ETH + ${ethers.formatUnits(tokenAmount, 6)} USDT`);
    console.log(`  获得 LP: ${ethers.formatEther(liquidity)}`);
});
```

## 💡 测试技巧

### 1. 价格影响测试
- 小额交换：价格影响 < 0.5%
- 中额交换：价格影响 1-3%
- 大额交换：价格影响 > 5%

### 2. 滑点测试
```
初始价格: 1 ETH = 3000 USDT
交换 1 ETH 后: 1 ETH = 2970 USDT (1% 滑点)
交换 5 ETH 后: 1 ETH = 2850 USDT (5% 滑点)
```

### 3. 无常损失测试
```
添加流动性: 10 ETH + 30000 USDT
价格变化后: ETH 价格上涨 50%
移除流动性: 计算无常损失
```

## 🛠️ 故障排除

### 问题：交易失败 "Insufficient output amount"
**解决**：增加滑点容忍度或减少交换数量

### 问题：添加流动性失败
**解决**：确保按正确比例添加，检查代币批准

### 问题：没有 USDT 余额
**解决**：使用菜单选项 7 获取测试代币

## 📚 AMM 公式理解

### 恒定乘积公式
```
x * y = k
其中：
- x = ETH 储备量
- y = USDT 储备量
- k = 常数
```

### 价格计算（含手续费）
```
输出 = (输入 * 997 * 输出储备) / (输入储备 * 1000 + 输入 * 997)
手续费 = 0.3%
```

### LP 代币价值
```
LP价值 = (LP代币数量 / 总LP供应量) * 池子总价值
```

## 🎯 高级测试

### 压力测试
```bash
# 创建压力测试脚本
npx hardhat run scripts/stress-test.js --network localhost
```

### Gas 优化测试
```bash
# 运行 gas 报告
npx hardhat test --network localhost
```

### 安全测试
- 重入攻击测试
- 整数溢出测试
- 闪电贷攻击模拟

## 📞 需要帮助？

如有问题，可以：
1. 查看合约代码：`contracts/LiquidityPool.sol`
2. 运行单元测试：`npm test`
3. 查看部署日志：检查终端输出
4. 使用 Hardhat Console 进行调试

---

祝测试愉快！ 🚀