const { ethers } = require("hardhat");

async function main() {
    // 获取合约地址
    const USDT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    
    // 获取合约实例
    const USDT = await ethers.getContractAt("USDT", USDT_ADDRESS);
    
    // 获取所有账户
    const [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
    const accounts = [owner, addr1, addr2, addr3, addr4];
    
    console.log("=== 账户USDT余额检查 ===");
    
    for (let i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        const balance = await USDT.balanceOf(account.address);
        const ethBalance = await ethers.provider.getBalance(account.address);
        
        console.log(`账户 ${i}: ${account.address}`);
        console.log(`  USDT余额: ${ethers.formatUnits(balance, 6)} USDT`);
        console.log(`  ETH余额: ${ethers.formatEther(ethBalance)} ETH`);
        console.log();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });