const { ethers } = require("hardhat");

async function main() {
    console.log("=== 流动性池交互脚本 ===\n");

    // 合约地址（从部署输出中获取）
    const USDT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const LIQUIDITY_POOL_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    // 获取签名者
    const [owner, user1, user2] = await ethers.getSigners();
    
    // 连接合约
    const usdt = await ethers.getContractAt("USDT", USDT_ADDRESS);
    const liquidityPool = await ethers.getContractAt("LiquidityPool", LIQUIDITY_POOL_ADDRESS);

    console.log("账户地址:");
    console.log("- Owner:", owner.address);
    console.log("- User1:", user1.address);
    console.log("- User2:", user2.address);
    console.log();

    // 1. 分发 USDT 给测试用户
    console.log("1. 分发 USDT 给测试用户");
    await usdt.transfer(user1.address, ethers.parseUnits("100000", 6));
    await usdt.transfer(user2.address, ethers.parseUnits("50000", 6));
    console.log("✓ User1 收到 100,000 USDT");
    console.log("✓ User2 收到 50,000 USDT");
    console.log();

    // 2. Owner 添加初始流动性
    console.log("2. Owner 添加初始流动性");
    const initialETH = ethers.parseEther("10");
    const initialUSDT = ethers.parseUnits("30000", 6);
    
    await usdt.approve(liquidityPool.target, initialUSDT);
    await liquidityPool.addLiquidity(initialUSDT, { value: initialETH });
    
    const [ethReserve, usdtReserve] = await liquidityPool.getReserves();
    console.log(`✓ 添加流动性: ${ethers.formatEther(initialETH)} ETH + ${ethers.formatUnits(initialUSDT, 6)} USDT`);
    console.log(`✓ 池子储备: ${ethers.formatEther(ethReserve)} ETH, ${ethers.formatUnits(usdtReserve, 6)} USDT`);
    console.log(`✓ Owner LP代币余额: ${ethers.formatEther(await liquidityPool.balanceOf(owner.address))}`);
    console.log();

    // 3. User1 用 ETH 换 USDT
    console.log("3. User1 用 ETH 换 USDT");
    const ethToSwap = ethers.parseEther("1");
    const minUSDTOut = ethers.parseUnits("2700", 6); // 设置最小输出
    
    const user1USDTBefore = await usdt.balanceOf(user1.address);
    await liquidityPool.connect(user1).swapETHForTokens(minUSDTOut, { value: ethToSwap });
    const user1USDTAfter = await usdt.balanceOf(user1.address);
    
    const usdtReceived = user1USDTAfter - user1USDTBefore;
    console.log(`✓ 交换: ${ethers.formatEther(ethToSwap)} ETH → ${ethers.formatUnits(usdtReceived, 6)} USDT`);
    
    const [ethReserve2, usdtReserve2] = await liquidityPool.getReserves();
    console.log(`✓ 新池子储备: ${ethers.formatEther(ethReserve2)} ETH, ${ethers.formatUnits(usdtReserve2, 6)} USDT`);
    console.log();

    // 4. User2 添加流动性
    console.log("4. User2 添加流动性");
    const user2ETH = ethers.parseEther("5");
    const user2USDT = ethers.parseUnits("13500", 6); // 按当前比例
    
    await usdt.connect(user2).approve(liquidityPool.target, user2USDT);
    await liquidityPool.connect(user2).addLiquidity(user2USDT, { value: user2ETH });
    
    console.log(`✓ User2 添加流动性: ${ethers.formatEther(user2ETH)} ETH + ${ethers.formatUnits(user2USDT, 6)} USDT`);
    console.log(`✓ User2 LP代币余额: ${ethers.formatEther(await liquidityPool.balanceOf(user2.address))}`);
    
    const [ethReserve3, usdtReserve3] = await liquidityPool.getReserves();
    console.log(`✓ 新池子储备: ${ethers.formatEther(ethReserve3)} ETH, ${ethers.formatUnits(usdtReserve3, 6)} USDT`);
    console.log();

    // 5. User1 用 USDT 换 ETH
    console.log("5. User1 用 USDT 换 ETH");
    const usdtToSwap = ethers.parseUnits("3000", 6);
    const minETHOut = ethers.parseEther("0.9");
    
    await usdt.connect(user1).approve(liquidityPool.target, usdtToSwap);
    
    const user1ETHBefore = await ethers.provider.getBalance(user1.address);
    const tx = await liquidityPool.connect(user1).swapTokensForETH(usdtToSwap, minETHOut);
    const receipt = await tx.wait();
    const user1ETHAfter = await ethers.provider.getBalance(user1.address);
    
    const ethReceived = user1ETHAfter - user1ETHBefore + (receipt.gasUsed * receipt.gasPrice);
    console.log(`✓ 交换: ${ethers.formatUnits(usdtToSwap, 6)} USDT → ${ethers.formatEther(ethReceived)} ETH`);
    
    const [ethReserve4, usdtReserve4] = await liquidityPool.getReserves();
    console.log(`✓ 新池子储备: ${ethers.formatEther(ethReserve4)} ETH, ${ethers.formatUnits(usdtReserve4, 6)} USDT`);
    console.log();

    // 6. 显示最终状态
    console.log("=== 最终状态 ===");
    console.log("\n流动性池:");
    console.log(`- ETH 储备: ${ethers.formatEther(ethReserve4)}`);
    console.log(`- USDT 储备: ${ethers.formatUnits(usdtReserve4, 6)}`);
    console.log(`- 总 LP 代币: ${ethers.formatEther(await liquidityPool.totalSupply())}`);
    
    console.log("\nLP 代币持有者:");
    console.log(`- Owner: ${ethers.formatEther(await liquidityPool.balanceOf(owner.address))}`);
    console.log(`- User2: ${ethers.formatEther(await liquidityPool.balanceOf(user2.address))}`);
    
    console.log("\n价格信息:");
    const ethPriceInUSDT = (Number(ethers.formatUnits(usdtReserve4, 6)) / Number(ethers.formatEther(ethReserve4))).toFixed(2);
    console.log(`- 1 ETH = ${ethPriceInUSDT} USDT`);
    console.log(`- 1 USDT = ${(1/ethPriceInUSDT).toFixed(6)} ETH`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });