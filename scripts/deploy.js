const { ethers } = require("hardhat");

async function main() {
    console.log("开始部署合约...");

    const [deployer] = await ethers.getSigners();
    console.log("部署地址:", deployer.address);
    console.log("账户余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // 部署 USDT 代币
    console.log("正在部署 USDT 代币...");
    const USDT = await ethers.getContractFactory("USDT");
    const usdt = await USDT.deploy();
    await usdt.waitForDeployment();
    
    console.log("USDT 合约地址:", await usdt.getAddress());

    // 部署流动性池
    console.log("正在部署流动性池...");
    const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
    const liquidityPool = await LiquidityPool.deploy(await usdt.getAddress());
    await liquidityPool.waitForDeployment();

    console.log("流动性池合约地址:", await liquidityPool.getAddress());

    // 验证部署
    console.log("\n=== 部署验证 ===");
    const usdtBalance = await usdt.balanceOf(deployer.address);
    console.log("部署者 USDT 余额:", ethers.formatUnits(usdtBalance, 6));
    
    console.log("\n=== 合约地址汇总 ===");
    console.log("USDT:", await usdt.getAddress());
    console.log("LiquidityPool:", await liquidityPool.getAddress());

    return {
        usdt: await usdt.getAddress(),
        liquidityPool: await liquidityPool.getAddress()
    };
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });