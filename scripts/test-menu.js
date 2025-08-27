const { ethers } = require("hardhat");
const readline = require('readline');

// 合约地址
const USDT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const LIQUIDITY_POOL_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

let usdt, liquidityPool, signer;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function init() {
    console.log("\n🚀 初始化合约连接...\n");
    
    const signers = await ethers.getSigners();
    signer = signers[0];
    
    usdt = await ethers.getContractAt("USDT", USDT_ADDRESS);
    liquidityPool = await ethers.getContractAt("LiquidityPool", LIQUIDITY_POOL_ADDRESS);
    
    console.log(`✅ 已连接到账户: ${signer.address}`);
    const ethBalance = await ethers.provider.getBalance(signer.address);
    const usdtBalance = await usdt.balanceOf(signer.address);
    console.log(`💰 ETH 余额: ${ethers.formatEther(ethBalance)} ETH`);
    console.log(`💰 USDT 余额: ${ethers.formatUnits(usdtBalance, 6)} USDT`);
}

async function showPoolInfo() {
    console.log("\n📊 === 流动性池当前状态 ===");
    
    const [ethReserve, usdtReserve] = await liquidityPool.getReserves();
    const totalSupply = await liquidityPool.totalSupply();
    const userLPBalance = await liquidityPool.balanceOf(signer.address);
    
    console.log(`\n池子储备:`);
    console.log(`  ETH:  ${ethers.formatEther(ethReserve)} ETH`);
    console.log(`  USDT: ${ethers.formatUnits(usdtReserve, 6)} USDT`);
    
    const price = ethReserve > 0 ? (Number(ethers.formatUnits(usdtReserve, 6)) / Number(ethers.formatEther(ethReserve))).toFixed(2) : 0;
    console.log(`\n当前价格:`);
    console.log(`  1 ETH = ${price} USDT`);
    console.log(`  1 USDT = ${price > 0 ? (1/price).toFixed(6) : 0} ETH`);
    
    console.log(`\nLP 代币:`);
    console.log(`  总供应量: ${ethers.formatEther(totalSupply)}`);
    console.log(`  您的余额: ${ethers.formatEther(userLPBalance)}`);
    
    if (totalSupply > 0n && userLPBalance > 0n) {
        const sharePercent = (Number(userLPBalance) / Number(totalSupply) * 100).toFixed(2);
        console.log(`  您的份额: ${sharePercent}%`);
    }
}

async function addLiquidity() {
    console.log("\n💧 === 添加流动性 ===\n");
    
    const [ethReserve, usdtReserve] = await liquidityPool.getReserves();
    
    if (ethReserve > 0n) {
        const ratio = Number(ethers.formatUnits(usdtReserve, 6)) / Number(ethers.formatEther(ethReserve));
        console.log(`📌 当前池子比例: 1 ETH = ${ratio.toFixed(2)} USDT`);
        console.log(`💡 建议按此比例添加流动性\n`);
    }
    
    const ethAmount = await question("请输入要添加的 ETH 数量: ");
    const usdtAmount = await question("请输入要添加的 USDT 数量: ");
    
    try {
        const ethValue = ethers.parseEther(ethAmount);
        const usdtValue = ethers.parseUnits(usdtAmount, 6);
        
        console.log("\n⏳ 批准 USDT...");
        const approveTx = await usdt.approve(liquidityPool.target, usdtValue);
        await approveTx.wait();
        console.log("✅ USDT 批准成功");
        
        console.log("⏳ 添加流动性...");
        const addTx = await liquidityPool.addLiquidity(usdtValue, { value: ethValue });
        await addTx.wait();
        
        console.log(`✅ 成功添加 ${ethAmount} ETH + ${usdtAmount} USDT 流动性！`);
        
        const lpBalance = await liquidityPool.balanceOf(signer.address);
        console.log(`🎯 获得 LP 代币: ${ethers.formatEther(lpBalance)}`);
        
    } catch (error) {
        console.error(`❌ 错误: ${error.message}`);
    }
}

async function removeLiquidity() {
    console.log("\n💸 === 移除流动性 ===\n");
    
    const lpBalance = await liquidityPool.balanceOf(signer.address);
    console.log(`您的 LP 代币余额: ${ethers.formatEther(lpBalance)}`);
    
    if (lpBalance === 0n) {
        console.log("❌ 您没有 LP 代币");
        return;
    }
    
    const amount = await question(`请输入要移除的 LP 代币数量 (最大: ${ethers.formatEther(lpBalance)}): `);
    
    try {
        const lpAmount = ethers.parseEther(amount);
        
        console.log("\n⏳ 移除流动性...");
        const removeTx = await liquidityPool.removeLiquidity(lpAmount);
        const receipt = await removeTx.wait();
        
        console.log(`✅ 成功移除流动性！`);
        
        // 解析事件获取具体数量
        const event = receipt.logs.find(log => {
            try {
                const parsed = liquidityPool.interface.parseLog(log);
                return parsed.name === 'RemoveLiquidity';
            } catch { return false; }
        });
        
        if (event) {
            const parsed = liquidityPool.interface.parseLog(event);
            console.log(`📊 收到:`);
            console.log(`  - ETH:  ${ethers.formatEther(parsed.args.ethAmount)} ETH`);
            console.log(`  - USDT: ${ethers.formatUnits(parsed.args.tokenAmount, 6)} USDT`);
        }
        
    } catch (error) {
        console.error(`❌ 错误: ${error.message}`);
    }
}

async function swapETHForUSDT() {
    console.log("\n🔄 === ETH 换 USDT ===\n");
    
    const [ethReserve, usdtReserve] = await liquidityPool.getReserves();
    const ethBalance = await ethers.provider.getBalance(signer.address);
    
    console.log(`您的 ETH 余额: ${ethers.formatEther(ethBalance)} ETH`);
    
    const ethAmount = await question("请输入要交换的 ETH 数量: ");
    
    try {
        const ethValue = ethers.parseEther(ethAmount);
        
        // 计算预期输出
        const expectedOutput = await liquidityPool.getAmountOut(ethValue, ethReserve, usdtReserve);
        console.log(`\n📊 预计获得: ${ethers.formatUnits(expectedOutput, 6)} USDT`);
        
        const slippage = await question("设置滑点保护 (%) [默认: 1]: ") || "1";
        const minOutput = expectedOutput * (100n - BigInt(Math.floor(parseFloat(slippage) * 100))) / 10000n;
        console.log(`🛡️ 最小输出: ${ethers.formatUnits(minOutput, 6)} USDT`);
        
        console.log("\n⏳ 执行交换...");
        const swapTx = await liquidityPool.swapETHForTokens(minOutput, { value: ethValue });
        const receipt = await swapTx.wait();
        
        // 解析事件
        const event = receipt.logs.find(log => {
            try {
                const parsed = liquidityPool.interface.parseLog(log);
                return parsed.name === 'Swap';
            } catch { return false; }
        });
        
        if (event) {
            const parsed = liquidityPool.interface.parseLog(event);
            console.log(`✅ 交换成功！`);
            console.log(`📊 实际获得: ${ethers.formatUnits(parsed.args.tokenOut, 6)} USDT`);
        }
        
    } catch (error) {
        console.error(`❌ 错误: ${error.message}`);
    }
}

async function swapUSDTForETH() {
    console.log("\n🔄 === USDT 换 ETH ===\n");
    
    const [ethReserve, usdtReserve] = await liquidityPool.getReserves();
    const usdtBalance = await usdt.balanceOf(signer.address);
    
    console.log(`您的 USDT 余额: ${ethers.formatUnits(usdtBalance, 6)} USDT`);
    
    const usdtAmount = await question("请输入要交换的 USDT 数量: ");
    
    try {
        const usdtValue = ethers.parseUnits(usdtAmount, 6);
        
        // 计算预期输出
        const expectedOutput = await liquidityPool.getAmountOut(usdtValue, usdtReserve, ethReserve);
        console.log(`\n📊 预计获得: ${ethers.formatEther(expectedOutput)} ETH`);
        
        const slippage = await question("设置滑点保护 (%) [默认: 1]: ") || "1";
        const minOutput = expectedOutput * (100n - BigInt(Math.floor(parseFloat(slippage) * 100))) / 10000n;
        console.log(`🛡️ 最小输出: ${ethers.formatEther(minOutput)} ETH`);
        
        console.log("\n⏳ 批准 USDT...");
        const approveTx = await usdt.approve(liquidityPool.target, usdtValue);
        await approveTx.wait();
        
        console.log("⏳ 执行交换...");
        const swapTx = await liquidityPool.swapTokensForETH(usdtValue, minOutput);
        const receipt = await swapTx.wait();
        
        // 解析事件
        const event = receipt.logs.find(log => {
            try {
                const parsed = liquidityPool.interface.parseLog(log);
                return parsed.name === 'Swap';
            } catch { return false; }
        });
        
        if (event) {
            const parsed = liquidityPool.interface.parseLog(event);
            console.log(`✅ 交换成功！`);
            console.log(`📊 实际获得: ${ethers.formatEther(parsed.args.ethOut)} ETH`);
        }
        
    } catch (error) {
        console.error(`❌ 错误: ${error.message}`);
    }
}

async function calculatePrice() {
    console.log("\n🧮 === 价格计算器 ===\n");
    
    const [ethReserve, usdtReserve] = await liquidityPool.getReserves();
    
    console.log("选择计算类型:");
    console.log("1. ETH → USDT");
    console.log("2. USDT → ETH");
    
    const choice = await question("请选择 (1/2): ");
    
    if (choice === "1") {
        const amount = await question("输入 ETH 数量: ");
        const ethValue = ethers.parseEther(amount);
        const output = await liquidityPool.getAmountOut(ethValue, ethReserve, usdtReserve);
        
        console.log(`\n📊 ${amount} ETH = ${ethers.formatUnits(output, 6)} USDT`);
        console.log(`💰 扣除 0.3% 手续费后的输出`);
        
    } else if (choice === "2") {
        const amount = await question("输入 USDT 数量: ");
        const usdtValue = ethers.parseUnits(amount, 6);
        const output = await liquidityPool.getAmountOut(usdtValue, usdtReserve, ethReserve);
        
        console.log(`\n📊 ${amount} USDT = ${ethers.formatEther(output)} ETH`);
        console.log(`💰 扣除 0.3% 手续费后的输出`);
    }
}

async function getTestTokens() {
    console.log("\n🎁 === 获取测试代币 ===\n");
    
    const signers = await ethers.getSigners();
    const owner = signers[0];
    
    if (signer.address === owner.address) {
        console.log("您已经是 Owner 账户，拥有初始代币");
        return;
    }
    
    // 切换到 owner 发送测试代币
    const usdtAsOwner = usdt.connect(owner);
    const amount = ethers.parseUnits("10000", 6);
    
    try {
        console.log("⏳ 发送 10,000 USDT...");
        const tx = await usdtAsOwner.transfer(signer.address, amount);
        await tx.wait();
        console.log("✅ 成功获得 10,000 USDT 测试代币！");
    } catch (error) {
        console.error(`❌ 错误: ${error.message}`);
    }
}

async function showMenu() {
    console.log("\n");
    console.log("╔══════════════════════════════════════╗");
    console.log("║     🏊 流动性池测试菜单 🏊           ║");
    console.log("╠══════════════════════════════════════╣");
    console.log("║  1. 📊 查看池子状态                  ║");
    console.log("║  2. 💧 添加流动性                    ║");
    console.log("║  3. 💸 移除流动性                    ║");
    console.log("║  4. 🔄 ETH 换 USDT                   ║");
    console.log("║  5. 🔄 USDT 换 ETH                   ║");
    console.log("║  6. 🧮 价格计算器                    ║");
    console.log("║  7. 🎁 获取测试代币                  ║");
    console.log("║  8. 🔄 刷新账户信息                  ║");
    console.log("║  0. 🚪 退出                          ║");
    console.log("╚══════════════════════════════════════╝");
}

async function main() {
    console.clear();
    console.log("╔══════════════════════════════════════╗");
    console.log("║   欢迎使用 ETH-USDT 流动性池测试器   ║");
    console.log("╚══════════════════════════════════════╝");
    
    await init();
    
    while (true) {
        await showMenu();
        const choice = await question("\n请选择操作 (0-8): ");
        
        switch(choice) {
            case "1":
                await showPoolInfo();
                break;
            case "2":
                await addLiquidity();
                break;
            case "3":
                await removeLiquidity();
                break;
            case "4":
                await swapETHForUSDT();
                break;
            case "5":
                await swapUSDTForETH();
                break;
            case "6":
                await calculatePrice();
                break;
            case "7":
                await getTestTokens();
                break;
            case "8":
                await init();
                break;
            case "0":
                console.log("\n👋 再见！");
                rl.close();
                process.exit(0);
            default:
                console.log("❌ 无效选择，请重试");
        }
        
        await question("\n按 Enter 继续...");
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});