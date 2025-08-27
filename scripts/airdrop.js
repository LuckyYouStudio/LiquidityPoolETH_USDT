const { ethers } = require("hardhat");

async function main() {
    // 目标地址
    const targetAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    
    // 获取合约地址
    const USDT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    
    // 获取合约实例和签名者
    const [owner] = await ethers.getSigners();
    const USDT = await ethers.getContractAt("USDT", USDT_ADDRESS, owner);
    
    // 获取账户0的所有USDT余额
    const senderBalance = await USDT.balanceOf(owner.address);
    const airdropAmount = senderBalance; // 转移所有余额
    
    console.log("=== USDT 空投 ===");
    console.log(`从账户: ${owner.address}`);
    console.log(`到账户: ${targetAddress}`);
    console.log(`数量: ${ethers.formatUnits(airdropAmount, 6)} USDT`);
    
    console.log(`发送方当前USDT余额: ${ethers.formatUnits(senderBalance, 6)} USDT`);
    
    if (senderBalance == 0) {
        console.log("❌ 发送方没有USDT可转账");
        return;
    }
    
    // 检查接收方当前余额
    const receiverBalanceBefore = await USDT.balanceOf(targetAddress);
    console.log(`接收方空投前USDT余额: ${ethers.formatUnits(receiverBalanceBefore, 6)} USDT`);
    
    // 执行转账
    console.log("🚀 开始转账...");
    const tx = await USDT.transfer(targetAddress, airdropAmount);
    console.log(`交易哈希: ${tx.hash}`);
    
    // 等待确认
    await tx.wait();
    console.log("✅ 交易已确认");
    
    // 检查转账后余额
    const receiverBalanceAfter = await USDT.balanceOf(targetAddress);
    const senderBalanceAfter = await USDT.balanceOf(owner.address);
    
    console.log("=== 转账后余额 ===");
    console.log(`发送方余额: ${ethers.formatUnits(senderBalanceAfter, 6)} USDT`);
    console.log(`接收方余额: ${ethers.formatUnits(receiverBalanceAfter, 6)} USDT`);
    console.log(`实际转账数量: ${ethers.formatUnits(receiverBalanceAfter - receiverBalanceBefore, 6)} USDT`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });