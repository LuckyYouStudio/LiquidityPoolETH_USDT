// 合约地址
const CONTRACTS = {
    USDT: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    LIQUIDITY_POOL: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'
};

// 全局变量
let provider, signer, contracts = {};
let currentAccount = null;
let isCalculating = false; // 防止循环触发计算

// 更新控制变量
let updateTimer = null;
let isUpdating = false;
let lastUpdateTime = 0;
let updateInterval = 30000; // 30秒更新间隔
let fastUpdateInterval = 5000; // 快速更新间隔（用户操作后）

// 初始化
window.addEventListener('load', async () => {
    initializeEventListeners();
    setupUpdateMechanisms();
    
    // 检查是否有 MetaMask
    if (typeof window.ethereum !== 'undefined') {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // 检查网络
        const network = await provider.getNetwork();
        if (network.chainId !== 1337 && network.chainId !== 31337) {
            showToast('请切换到本地测试网络 (localhost:8545)', 'warning');
        }
        
        // 自动连接钱包（如果之前连接过）
        const accounts = await provider.listAccounts();
        if (accounts.length > 0) {
            await connectWallet();
        }
    } else {
        showToast('请安装 MetaMask 钱包', 'error');
    }
});

// 事件监听器初始化
function initializeEventListeners() {
    // 钱包连接
    document.getElementById('connectWallet').addEventListener('click', connectWallet);
    document.getElementById('disconnectWallet').addEventListener('click', disconnectWallet);
    
    // 标签切换
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });
    
    // 流动性子标签
    document.querySelectorAll('.sub-tab').forEach(button => {
        button.addEventListener('click', () => switchLiquidityTab(button.dataset.action));
    });
    
    // 交换
    document.getElementById('swapFromAmount').addEventListener('input', () => calculateSwapOutput('from'));
    document.getElementById('swapToAmount').addEventListener('input', () => calculateSwapOutput('to'));
    document.getElementById('swapFromToken').addEventListener('change', () => {
        updateSwapTokens();
        calculateSwapOutput('from');
    });
    document.getElementById('swapDirection').addEventListener('click', reverseSwapDirection);
    document.getElementById('swapButton').addEventListener('click', executeSwap);
    
    // 添加流动性
    document.getElementById('addEthAmount').addEventListener('input', (e) => {
        // 清空USDT输入框，让自动计算生效
        if (e.target.value) {
            document.getElementById('addUsdtAmount').value = '';
        }
        calculateLiquidityRatio('eth');
    });
    document.getElementById('addUsdtAmount').addEventListener('input', (e) => {
        // 清空ETH输入框，让自动计算生效
        if (e.target.value) {
            document.getElementById('addEthAmount').value = '';
        }
        calculateLiquidityRatio('usdt');
    });
    document.getElementById('addLiquidityButton').addEventListener('click', addLiquidity);
    
    // 移除流动性
    document.getElementById('removeLpAmount').addEventListener('input', calculateRemoveAmount);
    document.getElementById('removePercent').addEventListener('input', updateRemoveLpFromSlider);
    document.getElementById('maxLpButton').addEventListener('click', setMaxLp);
    document.getElementById('removeLiquidityButton').addEventListener('click', removeLiquidity);
    
    // 水龙头
    document.getElementById('getUsdtButton').addEventListener('click', getUsdtFromFaucet);
    document.getElementById('getEthButton').addEventListener('click', getEthFromFaucet);
}

// 设置更新机制
function setupUpdateMechanisms() {
    // 页面可见性变化监听
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 页面获得/失去焦点监听
    window.addEventListener('focus', handlePageFocus);
    window.addEventListener('blur', handlePageBlur);
    
    // 开始定时更新
    startPeriodicUpdate();
}

// 处理页面可见性变化
function handleVisibilityChange() {
    if (document.hidden) {
        // 页面隐藏时降低更新频率
        stopPeriodicUpdate();
    } else {
        // 页面可见时恢复更新并立即更新一次
        triggerSmartUpdate('visibility');
        startPeriodicUpdate();
    }
}

// 处理页面获得焦点
function handlePageFocus() {
    triggerSmartUpdate('focus');
    startPeriodicUpdate();
}

// 处理页面失去焦点
function handlePageBlur() {
    // 可以选择停止更新以节省资源
    // stopPeriodicUpdate();
}

// 开始定时更新
function startPeriodicUpdate() {
    stopPeriodicUpdate(); // 先清除现有定时器
    
    if (!currentAccount) return; // 未连接钱包时不更新
    
    updateTimer = setInterval(() => {
        if (!document.hidden && currentAccount) {
            triggerSmartUpdate('periodic');
        }
    }, updateInterval);
}

// 停止定时更新
function stopPeriodicUpdate() {
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
    }
}

// 智能更新触发器（带防抖）
async function triggerSmartUpdate(source = 'manual', debounceMs = 1000) {
    const now = Date.now();
    
    // 防抖：如果距离上次更新太近，则跳过
    if (now - lastUpdateTime < debounceMs) {
        return;
    }
    
    // 防止并发更新
    if (isUpdating) {
        return;
    }
    
    console.log(`🔄 更新触发源: ${source}`);
    
    try {
        isUpdating = true;
        lastUpdateTime = now;
        
        // 显示更新指示器
        showUpdateIndicator(true);
        
        // 批量更新所有信息
        await updateAllInfo();
        
        // 用户操作后启用快速更新模式
        if (source === 'user_action') {
            enableFastUpdateMode();
        }
        
        // 显示更新成功
        showUpdateIndicator(false, true);
        
    } catch (error) {
        console.error('智能更新失败:', error);
        showUpdateIndicator(false, false);
    } finally {
        isUpdating = false;
    }
}

// 显示更新指示器
function showUpdateIndicator(updating = false, success = null) {
    const indicator = document.getElementById('updateIndicator');
    if (!indicator) return;
    
    if (updating) {
        indicator.textContent = '🔄';
        indicator.title = '正在更新...';
        indicator.style.animation = 'spin 1s linear infinite';
    } else if (success === true) {
        indicator.textContent = '✅';
        indicator.title = '更新成功';
        indicator.style.animation = 'none';
        // 2秒后恢复默认状态
        setTimeout(() => {
            indicator.textContent = '🔄';
            indicator.title = '自动更新中';
        }, 2000);
    } else if (success === false) {
        indicator.textContent = '❌';
        indicator.title = '更新失败';
        indicator.style.animation = 'none';
        setTimeout(() => {
            indicator.textContent = '🔄';
            indicator.title = '自动更新中';
        }, 3000);
    } else {
        indicator.textContent = '🔄';
        indicator.title = '自动更新中';
        indicator.style.animation = 'none';
    }
}

// 启用快速更新模式（用户操作后30秒内使用5秒间隔）
function enableFastUpdateMode() {
    const originalInterval = updateInterval;
    updateInterval = fastUpdateInterval;
    
    // 重启定时器以应用新间隔
    startPeriodicUpdate();
    
    // 30秒后恢复正常间隔
    setTimeout(() => {
        updateInterval = originalInterval;
        startPeriodicUpdate();
        console.log('🐌 恢复正常更新间隔');
    }, 30000);
    
    console.log('⚡ 启用快速更新模式');
}

// 连接钱包
async function connectWallet() {
    try {
        showLoading(true);
        
        // 确保 provider 已初始化
        if (typeof window.ethereum === 'undefined') {
            throw new Error('请安装 MetaMask 钱包');
        }
        
        provider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        currentAccount = accounts[0];
        signer = provider.getSigner();
        
        // 初始化合约
        contracts.usdt = new ethers.Contract(CONTRACTS.USDT, USDT_ABI, signer);
        contracts.liquidityPool = new ethers.Contract(CONTRACTS.LIQUIDITY_POOL, LIQUIDITY_POOL_ABI, signer);
        
        // 更新UI
        document.getElementById('connectWallet').classList.add('hidden');
        document.getElementById('walletAddress').classList.remove('hidden');
        document.querySelector('.address').textContent = 
            currentAccount.slice(0, 6) + '...' + currentAccount.slice(-4);
        
        // 监听账户变化
        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', () => window.location.reload());
        
        // 更新余额和池子信息
        await updateAllInfo();
        
        // 监听合约事件
        listenToContractEvents();
        
        // 启动定时更新
        startPeriodicUpdate();
        
        showToast('钱包连接成功', 'success');
        
    } catch (error) {
        console.error('连接钱包失败:', error);
        showToast('连接钱包失败', 'error');
    } finally {
        showLoading(false);
    }
}

// 断开钱包
function disconnectWallet() {
    currentAccount = null;
    contracts = {};
    
    // 停止定时更新
    stopPeriodicUpdate();
    
    document.getElementById('connectWallet').classList.remove('hidden');
    document.getElementById('walletAddress').classList.add('hidden');
    
    // 清空显示
    document.getElementById('ethBalance').textContent = '0.00';
    document.getElementById('usdtBalance').textContent = '0.00';
    document.getElementById('lpBalance').textContent = '0.00';
    document.getElementById('lpValue').textContent = '$0.00';
}

// 处理账户变化
function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else if (accounts[0] !== currentAccount) {
        window.location.reload();
    }
}

// 更新所有信息
async function updateAllInfo() {
    await Promise.all([
        updateBalances(),
        updatePoolInfo()
    ]);
}

// 更新余额
async function updateBalances() {
    if (!currentAccount) return;
    
    try {
        const [ethBalance, usdtBalance, lpBalance] = await Promise.all([
            provider.getBalance(currentAccount),
            contracts.usdt.balanceOf(currentAccount),
            contracts.liquidityPool.balanceOf(currentAccount)
        ]);
        
        document.getElementById('ethBalance').textContent = 
            parseFloat(ethers.utils.formatEther(ethBalance)).toFixed(4);
        document.getElementById('usdtBalance').textContent = 
            parseFloat(ethers.utils.formatUnits(usdtBalance, 6)).toFixed(2);
        document.getElementById('lpBalance').textContent = 
            parseFloat(ethers.utils.formatEther(lpBalance)).toFixed(6);
        
        // 计算LP代币价值
        await calculateLpValue(lpBalance);
            
    } catch (error) {
        console.error('更新余额失败:', error);
    }
}

// 计算LP代币价值
async function calculateLpValue(lpBalance) {
    if (!contracts.liquidityPool || lpBalance.eq(0)) {
        document.getElementById('lpValue').textContent = '$0.00';
        return;
    }
    
    try {
        const [reserves, totalSupply] = await Promise.all([
            contracts.liquidityPool.getReserves(),
            contracts.liquidityPool.totalSupply()
        ]);
        
        if (totalSupply.eq(0)) {
            document.getElementById('lpValue').textContent = '$0.00';
            return;
        }
        
        const ethReserve = parseFloat(ethers.utils.formatEther(reserves[0]));
        const usdtReserve = parseFloat(ethers.utils.formatUnits(reserves[1], 6));
        const lpBalanceNum = parseFloat(ethers.utils.formatEther(lpBalance));
        const totalSupplyNum = parseFloat(ethers.utils.formatEther(totalSupply));
        
        // 计算用户在池子中的份额
        const userShare = lpBalanceNum / totalSupplyNum;
        
        // 计算用户可以获得的ETH和USDT数量
        const userEth = ethReserve * userShare;
        const userUsdt = usdtReserve * userShare;
        
        // 计算总价值（假设1 USDT = $1）
        const ethPrice = ethReserve > 0 ? usdtReserve / ethReserve : 0;
        const totalValue = (userEth * ethPrice) + userUsdt;
        
        document.getElementById('lpValue').textContent = `$${totalValue.toFixed(2)}`;
        
    } catch (error) {
        console.error('计算LP价值失败:', error);
        document.getElementById('lpValue').textContent = '$0.00';
    }
}

// 更新池子信息
async function updatePoolInfo() {
    if (!contracts.liquidityPool) return;
    
    try {
        const [reserves, totalSupply] = await Promise.all([
            contracts.liquidityPool.getReserves(),
            contracts.liquidityPool.totalSupply()
        ]);
        
        const ethReserve = parseFloat(ethers.utils.formatEther(reserves[0]));
        const usdtReserve = parseFloat(ethers.utils.formatUnits(reserves[1], 6));
        
        document.getElementById('ethReserve').textContent = ethReserve.toFixed(4) + ' ETH';
        document.getElementById('usdtReserve').textContent = usdtReserve.toFixed(2) + ' USDT';
        document.getElementById('totalLp').textContent = 
            parseFloat(ethers.utils.formatEther(totalSupply)).toFixed(6);
        
        if (ethReserve > 0 && usdtReserve > 0) {
            // ETH价格 (每个ETH值多少USDT)
            const ethPriceInUsdt = (usdtReserve / ethReserve).toFixed(2);
            document.getElementById('price').textContent = `1 ETH = ${ethPriceInUsdt} USDT`;
            document.getElementById('ethPrice').textContent = `$${ethPriceInUsdt}`;
            
            // 池子总价值 (ETH价值的2倍，因为50%ETH + 50%USDT)
            const poolTotalValue = (ethReserve * parseFloat(ethPriceInUsdt) * 2).toFixed(2);
            document.getElementById('poolTotalValue').textContent = `$${poolTotalValue}`;
            
            // 更新当前比例显示
            if (document.getElementById('currentRatio')) {
                document.getElementById('currentRatio').textContent = `1 ETH : ${ethPriceInUsdt} USDT`;
            }
        } else {
            // 池子为空时的默认显示
            document.getElementById('ethPrice').textContent = '$0.00';
            document.getElementById('poolTotalValue').textContent = '$0.00';
            document.getElementById('price').textContent = '1 ETH = 0 USDT';
        }
        
    } catch (error) {
        console.error('更新池子信息失败:', error);
    }
}

// 切换标签
function switchTab(tabName) {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}Panel`).classList.add('active');
}

// 切换流动性子标签
function switchLiquidityTab(action) {
    document.querySelectorAll('.sub-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.liquidity-section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelector(`[data-action="${action}"]`).classList.add('active');
    document.getElementById(`${action}LiquiditySection`).classList.add('active');
}

// 计算交换输出（支持双向）
async function calculateSwapOutput(direction = 'from') {
    if (!contracts.liquidityPool || isCalculating) return;
    
    isCalculating = true; // 设置计算标志，防止循环触发
    
    try {
        const fromToken = document.getElementById('swapFromToken').value;
        const toToken = document.getElementById('swapToToken').value;
        const [ethReserve, usdtReserve] = await contracts.liquidityPool.getReserves();
        
        if (direction === 'from') {
            // 根据 "从" 输入框计算 "到" 输入框
            const fromAmount = document.getElementById('swapFromAmount').value;
            if (!fromAmount || parseFloat(fromAmount) <= 0) {
                document.getElementById('swapToAmount').value = '';
                isCalculating = false;
                return;
            }
            
            let outputAmount;
            if (fromToken === 'ETH') {
                const inputWei = ethers.utils.parseEther(fromAmount);
                outputAmount = await contracts.liquidityPool.getAmountOut(inputWei, ethReserve, usdtReserve);
                document.getElementById('swapToAmount').value = 
                    parseFloat(ethers.utils.formatUnits(outputAmount, 6)).toFixed(2);
            } else {
                const inputUsdt = ethers.utils.parseUnits(fromAmount, 6);
                outputAmount = await contracts.liquidityPool.getAmountOut(inputUsdt, usdtReserve, ethReserve);
                document.getElementById('swapToAmount').value = 
                    parseFloat(ethers.utils.formatEther(outputAmount)).toFixed(6);
            }
        } else if (direction === 'to') {
            // 根据 "到" 输入框计算 "从" 输入框
            const toAmount = document.getElementById('swapToAmount').value;
            if (!toAmount || parseFloat(toAmount) <= 0) {
                document.getElementById('swapFromAmount').value = '';
                isCalculating = false;
                return;
            }
            
            // 反向计算：需要多少输入才能得到指定输出
            let inputAmount;
            if (toToken === 'USDT') {
                // 要获得指定USDT，需要多少ETH
                const outputUsdt = ethers.utils.parseUnits(toAmount, 6);
                inputAmount = await calculateRequiredInput(outputUsdt, usdtReserve, ethReserve);
                document.getElementById('swapFromAmount').value = 
                    parseFloat(ethers.utils.formatEther(inputAmount)).toFixed(6);
            } else {
                // 要获得指定ETH，需要多少USDT
                const outputEth = ethers.utils.parseEther(toAmount);
                inputAmount = await calculateRequiredInput(outputEth, ethReserve, usdtReserve);
                document.getElementById('swapFromAmount').value = 
                    parseFloat(ethers.utils.formatUnits(inputAmount, 6)).toFixed(2);
            }
        }
        
        // 计算价格影响
        await calculatePriceImpact();
        
    } catch (error) {
        console.error('计算交换失败:', error);
    } finally {
        isCalculating = false; // 重置计算标志
    }
}

// 计算达到指定输出所需的输入（反向计算）
async function calculateRequiredInput(outputAmount, outputReserve, inputReserve) {
    // 基于恒定乘积公式的反向计算
    // 原公式: outputAmount = (inputAmount * 997 * outputReserve) / (inputReserve * 1000 + inputAmount * 997)
    // 反解得: inputAmount = (inputReserve * outputAmount * 1000) / ((outputReserve - outputAmount) * 997)
    
    const numerator = inputReserve.mul(outputAmount).mul(1000);
    const denominator = outputReserve.sub(outputAmount).mul(997);
    
    if (denominator.lte(0) || outputAmount.gte(outputReserve)) {
        throw new Error('输出数量过大');
    }
    
    return numerator.div(denominator);
}

// 计算价格影响
async function calculatePriceImpact() {
    const fromAmount = parseFloat(document.getElementById('swapFromAmount').value);
    const toAmount = parseFloat(document.getElementById('swapToAmount').value);
    
    if (!fromAmount || !toAmount) return;
    
    const fromToken = document.getElementById('swapFromToken').value;
    const [ethReserve, usdtReserve] = await contracts.liquidityPool.getReserves();
    
    const ethReserveNum = parseFloat(ethers.utils.formatEther(ethReserve));
    const usdtReserveNum = parseFloat(ethers.utils.formatUnits(usdtReserve, 6));
    
    let priceImpact;
    if (fromToken === 'ETH') {
        const currentPrice = usdtReserveNum / ethReserveNum;
        const newPrice = (usdtReserveNum - toAmount) / (ethReserveNum + fromAmount);
        priceImpact = Math.abs((newPrice - currentPrice) / currentPrice * 100);
    } else {
        const currentPrice = ethReserveNum / usdtReserveNum;
        const newPrice = (ethReserveNum - toAmount) / (usdtReserveNum + fromAmount);
        priceImpact = Math.abs((newPrice - currentPrice) / currentPrice * 100);
    }
    
    document.getElementById('priceImpact').textContent = priceImpact.toFixed(2) + '%';
    
    // 计算手续费
    const fee = fromAmount * 0.003;
    document.getElementById('swapFee').textContent = fee.toFixed(6) + ' ' + fromToken;
}

// 更新交换代币选择
function updateSwapTokens() {
    const fromToken = document.getElementById('swapFromToken').value;
    const toToken = document.getElementById('swapToToken');
    
    if (fromToken === 'ETH') {
        toToken.value = 'USDT';
    } else {
        toToken.value = 'ETH';
    }
}

// 反转交换方向
function reverseSwapDirection() {
    const fromToken = document.getElementById('swapFromToken');
    const fromAmount = document.getElementById('swapFromAmount').value;
    const toAmount = document.getElementById('swapToAmount').value;
    
    // 交换代币类型
    if (fromToken.value === 'ETH') {
        fromToken.value = 'USDT';
    } else {
        fromToken.value = 'ETH';
    }
    
    // 更新代币选择
    updateSwapTokens();
    
    // 交换数量
    document.getElementById('swapFromAmount').value = toAmount;
    document.getElementById('swapToAmount').value = fromAmount;
    
    // 重新计算
    calculateSwapOutput('from');
}

// 执行交换
async function executeSwap() {
    if (!currentAccount) {
        showToast('请先连接钱包', 'warning');
        return;
    }
    
    const fromAmount = document.getElementById('swapFromAmount').value;
    const fromToken = document.getElementById('swapFromToken').value;
    const slippage = parseFloat(document.getElementById('slippage').value);
    
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
        showToast('请输入交换数量', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        
        let tx;
        if (fromToken === 'ETH') {
            const ethAmount = ethers.utils.parseEther(fromAmount);
            const minOutput = ethers.utils.parseUnits(
                (parseFloat(document.getElementById('swapToAmount').value) * (100 - slippage) / 100).toFixed(6),
                6
            );
            
            tx = await contracts.liquidityPool.swapETHForTokens(minOutput, { value: ethAmount });
        } else {
            const usdtAmount = ethers.utils.parseUnits(fromAmount, 6);
            const minOutput = ethers.utils.parseEther(
                (parseFloat(document.getElementById('swapToAmount').value) * (100 - slippage) / 100).toFixed(18)
            );
            
            // 先批准
            const approveTx = await contracts.usdt.approve(CONTRACTS.LIQUIDITY_POOL, usdtAmount);
            await approveTx.wait();
            
            tx = await contracts.liquidityPool.swapTokensForETH(usdtAmount, minOutput);
        }
        
        await tx.wait();
        
        showToast('交换成功！', 'success');
        addToHistory('交换', `${fromAmount} ${fromToken} → ${document.getElementById('swapToAmount').value} ${document.getElementById('swapToToken').value}`);
        
        // 清空输入
        document.getElementById('swapFromAmount').value = '';
        document.getElementById('swapToAmount').value = '';
        
        // 触发智能更新
        await triggerSmartUpdate('user_action', 0);
        
    } catch (error) {
        console.error('交换失败:', error);
        showToast('交换失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 计算流动性比例
async function calculateLiquidityRatio(inputType = null) {
    if (!contracts.liquidityPool) return;
    
    const ethAmount = document.getElementById('addEthAmount').value;
    const usdtAmount = document.getElementById('addUsdtAmount').value;
    
    // 获取储备量
    const [ethReserve, usdtReserve] = await contracts.liquidityPool.getReserves();
    const totalSupply = await contracts.liquidityPool.totalSupply();
    
    // 如果池子已有流动性，根据当前比例自动计算
    if (totalSupply.gt(0)) {
        const ethReserveNum = parseFloat(ethers.utils.formatEther(ethReserve));
        const usdtReserveNum = parseFloat(ethers.utils.formatUnits(usdtReserve, 6));
        
        if (inputType === 'eth' && ethAmount && !usdtAmount) {
            // 根据ETH数量计算USDT
            const calculatedUsdt = (parseFloat(ethAmount) * usdtReserveNum / ethReserveNum).toFixed(2);
            document.getElementById('addUsdtAmount').value = calculatedUsdt;
        } else if (inputType === 'usdt' && usdtAmount && !ethAmount) {
            // 根据USDT数量计算ETH
            const calculatedEth = (parseFloat(usdtAmount) * ethReserveNum / usdtReserveNum).toFixed(6);
            document.getElementById('addEthAmount').value = calculatedEth;
        }
    }
    
    // 重新获取最新的输入值
    const finalEthAmount = document.getElementById('addEthAmount').value;
    const finalUsdtAmount = document.getElementById('addUsdtAmount').value;
    
    if (!finalEthAmount || !finalUsdtAmount) return;
    
    try {
        if (totalSupply.gt(0)) {
            // 计算预期 LP 代币
            const ethValue = ethers.utils.parseEther(finalEthAmount);
            const usdtValue = ethers.utils.parseUnits(finalUsdtAmount, 6);
            
            const ethLiquidity = ethValue.mul(totalSupply).div(ethReserve);
            const usdtLiquidity = usdtValue.mul(totalSupply).div(usdtReserve);
            
            const liquidity = ethLiquidity.lt(usdtLiquidity) ? ethLiquidity : usdtLiquidity;
            
            document.getElementById('expectedLp').textContent = 
                parseFloat(ethers.utils.formatEther(liquidity)).toFixed(6);
            
            // 计算份额
            const newTotal = totalSupply.add(liquidity);
            const sharePercent = liquidity.mul(10000).div(newTotal).toNumber() / 100;
            document.getElementById('sharePercent').textContent = sharePercent.toFixed(2) + '%';
        } else {
            // 初始流动性
            const ethValue = ethers.utils.parseEther(finalEthAmount);
            const usdtValue = ethers.utils.parseUnits(finalUsdtAmount, 6);
            const liquidity = sqrt(ethValue.mul(usdtValue)).sub(1000);
            
            document.getElementById('expectedLp').textContent = 
                parseFloat(ethers.utils.formatEther(liquidity)).toFixed(6);
            document.getElementById('sharePercent').textContent = '100%';
        }
    } catch (error) {
        console.error('计算流动性失败:', error);
    }
}

// 平方根函数（用于初始流动性计算）
function sqrt(value) {
    const ONE = ethers.BigNumber.from(1);
    const TWO = ethers.BigNumber.from(2);
    let x = value;
    let y = x.add(ONE).div(TWO);
    while (y.lt(x)) {
        x = y;
        y = x.add(value.div(x)).div(TWO);
    }
    return x;
}

// 添加流动性
async function addLiquidity() {
    if (!currentAccount) {
        showToast('请先连接钱包', 'warning');
        return;
    }
    
    const ethAmount = document.getElementById('addEthAmount').value;
    const usdtAmount = document.getElementById('addUsdtAmount').value;
    
    if (!ethAmount || !usdtAmount) {
        showToast('请输入 ETH 和 USDT 数量', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        
        const ethValue = ethers.utils.parseEther(ethAmount);
        const usdtValue = ethers.utils.parseUnits(usdtAmount, 6);
        
        // 批准 USDT
        const approveTx = await contracts.usdt.approve(CONTRACTS.LIQUIDITY_POOL, usdtValue);
        await approveTx.wait();
        
        // 添加流动性
        const tx = await contracts.liquidityPool.addLiquidity(usdtValue, { value: ethValue });
        await tx.wait();
        
        showToast('添加流动性成功！', 'success');
        addToHistory('添加流动性', `${ethAmount} ETH + ${usdtAmount} USDT`);
        
        // 清空输入
        document.getElementById('addEthAmount').value = '';
        document.getElementById('addUsdtAmount').value = '';
        
        // 触发智能更新
        await triggerSmartUpdate('user_action', 0);
        
    } catch (error) {
        console.error('添加流动性失败:', error);
        showToast('添加流动性失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 设置最大 LP
async function setMaxLp() {
    const lpBalance = await contracts.liquidityPool.balanceOf(currentAccount);
    document.getElementById('removeLpAmount').value = ethers.utils.formatEther(lpBalance);
    document.getElementById('removePercent').value = 100;
    calculateRemoveAmount();
}

// 从滑块更新 LP 数量
async function updateRemoveLpFromSlider() {
    const percent = document.getElementById('removePercent').value;
    const lpBalance = await contracts.liquidityPool.balanceOf(currentAccount);
    const lpAmount = lpBalance.mul(percent).div(100);
    document.getElementById('removeLpAmount').value = ethers.utils.formatEther(lpAmount);
    calculateRemoveAmount();
}

// 计算移除数量
async function calculateRemoveAmount() {
    if (!contracts.liquidityPool) return;
    
    const lpAmount = document.getElementById('removeLpAmount').value;
    if (!lpAmount || parseFloat(lpAmount) <= 0) {
        document.getElementById('expectedEth').textContent = '0.00';
        document.getElementById('expectedUsdt').textContent = '0.00';
        return;
    }
    
    try {
        const lpValue = ethers.utils.parseEther(lpAmount);
        const [ethReserve, usdtReserve] = await contracts.liquidityPool.getReserves();
        const totalSupply = await contracts.liquidityPool.totalSupply();
        
        const ethAmount = lpValue.mul(ethReserve).div(totalSupply);
        const usdtAmount = lpValue.mul(usdtReserve).div(totalSupply);
        
        document.getElementById('expectedEth').textContent = 
            parseFloat(ethers.utils.formatEther(ethAmount)).toFixed(6);
        document.getElementById('expectedUsdt').textContent = 
            parseFloat(ethers.utils.formatUnits(usdtAmount, 6)).toFixed(2);
            
    } catch (error) {
        console.error('计算移除数量失败:', error);
    }
}

// 移除流动性
async function removeLiquidity() {
    if (!currentAccount) {
        showToast('请先连接钱包', 'warning');
        return;
    }
    
    const lpAmount = document.getElementById('removeLpAmount').value;
    
    if (!lpAmount || parseFloat(lpAmount) <= 0) {
        showToast('请输入要移除的 LP 数量', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        
        const lpValue = ethers.utils.parseEther(lpAmount);
        const tx = await contracts.liquidityPool.removeLiquidity(lpValue);
        await tx.wait();
        
        showToast('移除流动性成功！', 'success');
        addToHistory('移除流动性', `${lpAmount} LP`);
        
        // 清空输入
        document.getElementById('removeLpAmount').value = '';
        document.getElementById('removePercent').value = 0;
        
        // 触发智能更新
        await triggerSmartUpdate('user_action', 0);
        
    } catch (error) {
        console.error('移除流动性失败:', error);
        showToast('移除流动性失败: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// 从水龙头获取 USDT
async function getUsdtFromFaucet() {
    if (!currentAccount) {
        showToast('请先连接钱包', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        
        // 使用第一个账户（通常是有大量USDT的账户）
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length === 0) {
            throw new Error('没有可用的账户');
        }
        
        // 预定义的水龙头账户地址（通常是第一个部署账户）
        const faucetAddress = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
        
        // 检查是否是自己给自己转账
        if (faucetAddress.toLowerCase() === currentAccount.toLowerCase()) {
            document.getElementById('faucetMessage').className = 'message warning';
            document.getElementById('faucetMessage').textContent = '你已经是水龙头管理员，不需要获取USDT';
            return;
        }
        
        // 使用 provider.getSigner() 但不指定索引，让用户选择
        const signer = provider.getSigner();
        const usdtContract = new ethers.Contract(CONTRACTS.USDT, USDT_ABI, signer);
        
        // 检查当前签名者的余额
        const signerAddress = await signer.getAddress();
        const balance = await usdtContract.balanceOf(signerAddress);
        const amount = ethers.utils.parseUnits("10000", 6);
        
        console.log(`当前签名者: ${signerAddress}`);
        console.log(`USDT余额: ${ethers.utils.formatUnits(balance, 6)}`);
        
        if (balance.lt(amount)) {
            throw new Error(`当前账户USDT余额不足。当前余额: ${ethers.utils.formatUnits(balance, 6)} USDT，需要: 10000 USDT。请在MetaMask中切换到有足够USDT的账户。`);
        }
        
        const tx = await usdtContract.transfer(currentAccount, amount);
        await tx.wait();
        
        document.getElementById('faucetMessage').className = 'message success';
        document.getElementById('faucetMessage').textContent = '成功获得 10,000 USDT！';
        
        // 触发智能更新
        await triggerSmartUpdate('user_action', 0);
        
    } catch (error) {
        console.error('获取 USDT 失败:', error);
        document.getElementById('faucetMessage').className = 'message error';
        
        let errorMessage = '获取失败: ';
        if (error.message.includes('insufficient funds')) {
            errorMessage += 'Gas费不够，请确保有足够的ETH';
        } else if (error.message.includes('User rejected')) {
            errorMessage += '用户取消了交易';
        } else if (error.message.includes('余额不足')) {
            errorMessage += error.message;
        } else {
            errorMessage += error.message;
        }
        
        document.getElementById('faucetMessage').textContent = errorMessage;
    } finally {
        showLoading(false);
    }
}

// 从水龙头获取 ETH
async function getEthFromFaucet() {
    showToast('请使用 MetaMask 测试网络的水龙头功能', 'info');
}

// 监听合约事件
function listenToContractEvents() {
    if (!contracts.liquidityPool) return;
    
    contracts.liquidityPool.on('Swap', (user, ethIn, tokenIn, ethOut, tokenOut, event) => {
        console.log('🔄 检测到交换事件:', user);
        if (user.toLowerCase() === currentAccount.toLowerCase()) {
            // 自己的交易，已经在操作后更新了
            return;
        } else {
            // 其他用户的交易，需要更新池子状态
            triggerSmartUpdate('other_user_swap');
        }
    });
    
    contracts.liquidityPool.on('AddLiquidity', (provider, ethAmount, tokenAmount, liquidity, event) => {
        console.log('💧 检测到添加流动性事件:', provider);
        if (provider.toLowerCase() === currentAccount.toLowerCase()) {
            return;
        } else {
            triggerSmartUpdate('other_user_liquidity');
        }
    });
    
    contracts.liquidityPool.on('RemoveLiquidity', (provider, ethAmount, tokenAmount, liquidity, event) => {
        console.log('💧 检测到移除流动性事件:', provider);
        if (provider.toLowerCase() === currentAccount.toLowerCase()) {
            return;
        } else {
            triggerSmartUpdate('other_user_liquidity');
        }
    });
}

// 添加到历史记录
function addToHistory(type, details) {
    const historyList = document.getElementById('transactionHistory');
    const noHistory = historyList.querySelector('.no-history');
    
    if (noHistory) {
        noHistory.remove();
    }
    
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
        <div>
            <div class="history-type">${type}</div>
            <div class="history-details">${details}</div>
        </div>
        <div class="history-time">${new Date().toLocaleTimeString()}</div>
    `;
    
    historyList.insertBefore(historyItem, historyList.firstChild);
    
    // 只保留最近10条
    while (historyList.children.length > 10) {
        historyList.removeChild(historyList.lastChild);
    }
}

// 显示提示
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// 显示/隐藏加载
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}