// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title USDT 代币合约
 * @dev 基于 ERC20 标准的测试版 USDT 代币
 * @author 流动性池项目
 */
contract USDT is ERC20 {
    /**
     * @dev 构造函数 - 初始化代币并铸造初始供应量
     * 创建名为 "Tether USD" 符号为 "USDT" 的代币
     * 向部署者铸造 1,000,000 USDT (考虑6位小数)
     */
    constructor() ERC20("Tether USD", "USDT") {
        // 向合约部署者铸造 100 万个 USDT 代币
        _mint(msg.sender, 1000000 * 10**decimals());
    }
    
    /**
     * @dev 重写小数位数函数
     * @return uint8 USDT 使用 6 位小数（与真实 USDT 一致）
     */
    function decimals() public view virtual override returns (uint8) {
        return 6; // USDT 标准为 6 位小数
    }
}