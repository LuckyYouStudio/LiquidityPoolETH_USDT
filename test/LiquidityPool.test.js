const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityPool", function () {
    let usdt, liquidityPool;
    let owner, addr1, addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        // 部署 USDT
        const USDT = await ethers.getContractFactory("USDT");
        usdt = await USDT.deploy();
        await usdt.waitForDeployment();

        // 部署流动性池
        const LiquidityPool = await ethers.getContractFactory("LiquidityPool");
        liquidityPool = await LiquidityPool.deploy(await usdt.getAddress());
        await liquidityPool.waitForDeployment();

        // 给测试账户转一些 USDT
        await usdt.transfer(addr1.address, ethers.parseUnits("10000", 6));
        await usdt.transfer(addr2.address, ethers.parseUnits("10000", 6));
    });

    describe("部署", function () {
        it("应该正确设置代币地址", async function () {
            expect(await liquidityPool.token()).to.equal(await usdt.getAddress());
        });

        it("应该有正确的名称和符号", async function () {
            expect(await liquidityPool.name()).to.equal("ETH-USDT LP");
            expect(await liquidityPool.symbol()).to.equal("ETH-USDT-LP");
        });
    });

    describe("添加流动性", function () {
        it("应该能够添加初始流动性", async function () {
            const ethAmount = ethers.parseEther("1");
            const tokenAmount = ethers.parseUnits("3000", 6);

            await usdt.connect(addr1).approve(await liquidityPool.getAddress(), tokenAmount);

            await expect(
                liquidityPool.connect(addr1).addLiquidity(tokenAmount, { value: ethAmount })
            ).to.emit(liquidityPool, "AddLiquidity");

            const [ethReserve, tokenReserve] = await liquidityPool.getReserves();
            expect(ethReserve).to.equal(ethAmount);
            expect(tokenReserve).to.equal(tokenAmount);
        });

        it("应该为初始提供者铸造 LP 代币", async function () {
            const ethAmount = ethers.parseEther("1");
            const tokenAmount = ethers.parseUnits("3000", 6);

            await usdt.connect(addr1).approve(await liquidityPool.getAddress(), tokenAmount);
            await liquidityPool.connect(addr1).addLiquidity(tokenAmount, { value: ethAmount });

            const lpBalance = await liquidityPool.balanceOf(addr1.address);
            expect(lpBalance).to.be.gt(0);
        });

        it("应该按比例添加后续流动性", async function () {
            // 添加初始流动性
            const ethAmount1 = ethers.parseEther("1");
            const tokenAmount1 = ethers.parseUnits("3000", 6);

            await usdt.connect(addr1).approve(await liquidityPool.getAddress(), tokenAmount1);
            await liquidityPool.connect(addr1).addLiquidity(tokenAmount1, { value: ethAmount1 });

            // 添加第二次流动性
            const ethAmount2 = ethers.parseEther("0.5");
            const tokenAmount2 = ethers.parseUnits("1500", 6);

            await usdt.connect(addr2).approve(await liquidityPool.getAddress(), tokenAmount2);
            await liquidityPool.connect(addr2).addLiquidity(tokenAmount2, { value: ethAmount2 });

            const [ethReserve, tokenReserve] = await liquidityPool.getReserves();
            expect(ethReserve).to.equal(ethAmount1 + ethAmount2);
            expect(tokenReserve).to.equal(tokenAmount1 + tokenAmount2);
        });
    });

    describe("移除流动性", function () {
        beforeEach(async function () {
            const ethAmount = ethers.parseEther("2");
            const tokenAmount = ethers.parseUnits("6000", 6);

            await usdt.connect(addr1).approve(await liquidityPool.getAddress(), tokenAmount);
            await liquidityPool.connect(addr1).addLiquidity(tokenAmount, { value: ethAmount });
        });

        it("应该能够移除流动性", async function () {
            const lpBalance = await liquidityPool.balanceOf(addr1.address);
            const removeAmount = lpBalance / 2n;

            const balanceBefore = await ethers.provider.getBalance(addr1.address);

            await expect(
                liquidityPool.connect(addr1).removeLiquidity(removeAmount)
            ).to.emit(liquidityPool, "RemoveLiquidity");

            const balanceAfter = await ethers.provider.getBalance(addr1.address);
            expect(balanceAfter).to.be.gt(balanceBefore);
        });
    });

    describe("交换", function () {
        beforeEach(async function () {
            // 添加初始流动性 1 ETH : 3000 USDT
            const ethAmount = ethers.parseEther("10");
            const tokenAmount = ethers.parseUnits("30000", 6);

            await usdt.connect(owner).approve(await liquidityPool.getAddress(), tokenAmount);
            await liquidityPool.connect(owner).addLiquidity(tokenAmount, { value: ethAmount });
        });

        it("应该能够用 ETH 换取代币", async function () {
            const ethIn = ethers.parseEther("1");
            const minTokensOut = ethers.parseUnits("2700", 6);

            const tokenBalanceBefore = await usdt.balanceOf(addr1.address);

            await expect(
                liquidityPool.connect(addr1).swapETHForTokens(minTokensOut, { value: ethIn })
            ).to.emit(liquidityPool, "Swap");

            const tokenBalanceAfter = await usdt.balanceOf(addr1.address);
            expect(tokenBalanceAfter).to.be.gt(tokenBalanceBefore);
        });

        it("应该能够用代币换取 ETH", async function () {
            const tokenIn = ethers.parseUnits("3000", 6);
            const minEthOut = ethers.parseEther("0.9");

            await usdt.connect(addr1).approve(await liquidityPool.getAddress(), tokenIn);

            const ethBalanceBefore = await ethers.provider.getBalance(addr1.address);

            await expect(
                liquidityPool.connect(addr1).swapTokensForETH(tokenIn, minEthOut)
            ).to.emit(liquidityPool, "Swap");

            const ethBalanceAfter = await ethers.provider.getBalance(addr1.address);
            expect(ethBalanceAfter).to.be.gt(ethBalanceBefore);
        });

        it("应该遵循恒定乘积公式", async function () {
            const [ethReserveBefore, tokenReserveBefore] = await liquidityPool.getReserves();
            const kBefore = ethReserveBefore * tokenReserveBefore;

            const ethIn = ethers.parseEther("1");
            const minTokensOut = 0;

            await liquidityPool.connect(addr1).swapETHForTokens(minTokensOut, { value: ethIn });

            const [ethReserveAfter, tokenReserveAfter] = await liquidityPool.getReserves();
            const kAfter = ethReserveAfter * tokenReserveAfter;

            // 由于有手续费，k 应该略有增加
            expect(kAfter).to.be.gt(kBefore);
        });
    });

    describe("价格计算", function () {
        it("应该正确计算输出金额", async function () {
            const amountIn = ethers.parseEther("1");
            const reserveIn = ethers.parseEther("10");
            const reserveOut = ethers.parseUnits("30000", 6);

            const amountOut = await liquidityPool.getAmountOut(amountIn, reserveIn, reserveOut);
            
            // 使用 0.3% 手续费的计算: (1 * 0.997 * 30000) / (10 + 1 * 0.997)
            const expectedOut = (amountIn * 997n * reserveOut) / (reserveIn * 1000n + amountIn * 997n);
            expect(amountOut).to.equal(expectedOut);
        });

        it("应该正确计算报价", async function () {
            const amountA = ethers.parseEther("1");
            const reserveA = ethers.parseEther("10");
            const reserveB = ethers.parseUnits("30000", 6);

            const quote = await liquidityPool.quote(amountA, reserveA, reserveB);
            const expectedQuote = (amountA * reserveB) / reserveA;
            
            expect(quote).to.equal(expectedQuote);
        });
    });
});