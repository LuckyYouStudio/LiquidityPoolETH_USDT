// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ETH-USDT 流动性池合约
 * @dev 实现 ETH 和 USDT 代币之间的 AMM 流动性池
 * @author 流动性池项目
 * 
 * 主要功能:
 * - 添加/移除流动性
 * - ETH 与 USDT 之间的代币交换
 * - 流动性提供者可获得 LP 代币作为凭证
 * - 采用恒定乘积 (x*y=k) 算法
 */
contract LiquidityPool is ERC20, ReentrancyGuard {
    using Math for uint256;

    // 绑定的 USDT 代币合约地址（部署后不可变更）
    IERC20 public immutable token;
    
    // 最小流动性常数 - 防止除零错误
    uint256 private constant MINIMUM_LIQUIDITY = 1000;
    
    // 事件定义
    event AddLiquidity(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 liquidity); // 添加流动性事件
    event RemoveLiquidity(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 liquidity); // 移除流动性事件
    event Swap(address indexed user, uint256 ethIn, uint256 tokenIn, uint256 ethOut, uint256 tokenOut); // 交换事件

    /**
     * @dev 构造函数 - 初始化流动性池
     * @param _token USDT 代币合约地址
     */
    constructor(address _token) ERC20("ETH-USDT LP", "ETH-USDT-LP") {
        token = IERC20(_token); // 设置 USDT 代币合约
    }

    /**
     * @dev 添加流动性 - 同时提供 ETH 和 USDT
     * @param tokenAmount 要添加的 USDT 数量
     * @return liquidity 获得的 LP 代币数量
     * 
     * 流程:
     * 1. 验证输入数量有效性
     * 2. 计算当前池子储备
     * 3. 根据是否为首次添加流动性，使用不同算法
     * 4. 转移 USDT 并铸造 LP 代币
     */
    function addLiquidity(uint256 tokenAmount) 
        external 
        payable 
        nonReentrant 
        returns (uint256 liquidity) 
    {
        require(msg.value > 0 && tokenAmount > 0, "Invalid amounts"); // 检查输入量有效

        // 获取当前池子储备（不包含本次转入的 ETH）
        uint256 ethBalance = address(this).balance - msg.value;
        uint256 tokenBalance = token.balanceOf(address(this));

        if (totalSupply() == 0) {
            // 首次添加流动性：使用几何平均数公式
            liquidity = Math.sqrt(msg.value * tokenAmount) - MINIMUM_LIQUIDITY;
            _mint(address(1), MINIMUM_LIQUIDITY); // 铸造最小流动性到黑洞地址
        } else {
            // 后续添加：按比例计算，取较小值防止套利
            uint256 ethLiquidity = (msg.value * totalSupply()) / ethBalance;
            uint256 tokenLiquidity = (tokenAmount * totalSupply()) / tokenBalance;
            liquidity = Math.min(ethLiquidity, tokenLiquidity);
        }

        require(liquidity > 0, "Insufficient liquidity minted"); // 检查铸造的 LP 数量

        // 转移 USDT 并铸造 LP 代币
        require(token.transferFrom(msg.sender, address(this), tokenAmount), "Token transfer failed");
        _mint(msg.sender, liquidity);

        emit AddLiquidity(msg.sender, msg.value, tokenAmount, liquidity);
    }

    /**
     * @dev 移除流动性 - 销毁 LP 代币换取 ETH 和 USDT
     * @param liquidity 要销毁的 LP 代币数量
     * @return ethAmount 获得的 ETH 数量
     * @return tokenAmount 获得的 USDT 数量
     * 
     * 流程:
     * 1. 验证 LP 代币数量和用户余额
     * 2. 按比例计算可提取的 ETH 和 USDT
     * 3. 销毁 LP 代币并返还资产
     */
    function removeLiquidity(uint256 liquidity) 
        external 
        nonReentrant 
        returns (uint256 ethAmount, uint256 tokenAmount) 
    {
        require(liquidity > 0, "Invalid liquidity"); // 检查 LP 数量有效
        require(balanceOf(msg.sender) >= liquidity, "Insufficient LP tokens"); // 检查 LP 余额

        // 获取当前池子储备
        uint256 ethBalance = address(this).balance;
        uint256 tokenBalance = token.balanceOf(address(this));

        // 按比例计算可提取的数量
        ethAmount = (liquidity * ethBalance) / totalSupply();
        tokenAmount = (liquidity * tokenBalance) / totalSupply();

        require(ethAmount > 0 && tokenAmount > 0, "Insufficient liquidity burned"); // 检查提取数量

        _burn(msg.sender, liquidity); // 销毁 LP 代币
        
        // 转账 ETH 和 USDT
        payable(msg.sender).transfer(ethAmount);
        require(token.transfer(msg.sender, tokenAmount), "Token transfer failed");

        emit RemoveLiquidity(msg.sender, ethAmount, tokenAmount, liquidity);
    }

    /**
     * @dev ETH 换 USDT - 用 ETH 购买 USDT
     * @param minTokensOut 最少获得的 USDT 数量（滑点保护）
     * @return tokensOut 实际获得的 USDT 数量
     * 
     * 流程:
     * 1. 验证 ETH 数量有效
     * 2. 计算可获得的 USDT 数量（含 0.3% 手续费）
     * 3. 检查滑点限制
     * 4. 转账 USDT
     */
    function swapETHForTokens(uint256 minTokensOut) 
        external 
        payable 
        nonReentrant 
        returns (uint256 tokensOut) 
    {
        require(msg.value > 0, "Invalid ETH amount"); // 检查 ETH 数量

        // 获取交换前的储备（不包含本次转入的 ETH）
        uint256 ethReserve = address(this).balance - msg.value;
        uint256 tokenReserve = token.balanceOf(address(this));

        // 计算输出量（含手续费）
        tokensOut = getAmountOut(msg.value, ethReserve, tokenReserve);
        require(tokensOut >= minTokensOut, "Insufficient output amount"); // 检查滑点

        require(token.transfer(msg.sender, tokensOut), "Token transfer failed");

        emit Swap(msg.sender, msg.value, 0, 0, tokensOut);
    }

    /**
     * @dev USDT 换 ETH - 用 USDT 购买 ETH
     * @param tokenAmount 要交换的 USDT 数量
     * @param minETHOut 最少获得的 ETH 数量（滑点保护）
     * @return ethOut 实际获得的 ETH 数量
     * 
     * 流程:
     * 1. 验证 USDT 数量有效
     * 2. 计算可获得的 ETH 数量（含 0.3% 手续费）
     * 3. 检查滑点限制
     * 4. 转入 USDT 并转出 ETH
     */
    function swapTokensForETH(uint256 tokenAmount, uint256 minETHOut) 
        external 
        nonReentrant 
        returns (uint256 ethOut) 
    {
        require(tokenAmount > 0, "Invalid token amount"); // 检查 USDT 数量

        // 获取当前储备
        uint256 ethReserve = address(this).balance;
        uint256 tokenReserve = token.balanceOf(address(this));

        // 计算输出量（含手续费）
        ethOut = getAmountOut(tokenAmount, tokenReserve, ethReserve);
        require(ethOut >= minETHOut, "Insufficient output amount"); // 检查滑点

        // 转入 USDT 并转出 ETH
        require(token.transferFrom(msg.sender, address(this), tokenAmount), "Token transfer failed");
        payable(msg.sender).transfer(ethOut);

        emit Swap(msg.sender, 0, tokenAmount, ethOut, 0);
    }

    /**
     * @dev 计算交换输出量 - 恒定乘积公式 (x * y = k)
     * @param amountIn 输入数量
     * @param reserveIn 输入代币的储备量
     * @param reserveOut 输出代币的储备量
     * @return 输出数量（扣除 0.3% 手续费后）
     * 
     * 公式: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
     * 其中 997/1000 = 0.997，即扣除 0.3% 手续费
     */
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) 
        public 
        pure 
        returns (uint256) 
    {
        require(amountIn > 0, "Invalid input amount"); // 检查输入量
        require(reserveIn > 0 && reserveOut > 0, "Invalid reserves"); // 检查储备量

        // 扣除 0.3% 手续费后的输入量
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        
        return numerator / denominator;
    }

    /**
     * @dev 获取当前池子储备量
     * @return ethReserve ETH 储备量
     * @return tokenReserve USDT 储备量
     */
    function getReserves() external view returns (uint256 ethReserve, uint256 tokenReserve) {
        ethReserve = address(this).balance;        // 合约 ETH 余额
        tokenReserve = token.balanceOf(address(this)); // 合约 USDT 余额
    }

    /**
     * @dev 价格报价函数 - 按当前池子比例计算交换数量
     * @param amountA 代币 A 的数量
     * @param reserveA 代币 A 的储备量
     * @param reserveB 代币 B 的储备量
     * @return amountB 对应的代币 B 数量（不含手续费）
     * 
     * 注意: 此函数仅用于价格参考，实际交换请使用 getAmountOut
     */
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) 
        external 
        pure 
        returns (uint256 amountB) 
    {
        require(amountA > 0, "Invalid amount");              // 检查输入量
        require(reserveA > 0 && reserveB > 0, "Invalid reserves"); // 检查储备量
        amountB = (amountA * reserveB) / reserveA;          // 简单比例计算
    }
}