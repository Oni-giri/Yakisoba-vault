// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "../interfaces/IDataProvider.sol";
import "../interfaces/IAaveV3Incentives.sol";
import "../interfaces/ILendingPool.sol";


import "./pipelineAbstract.sol";

contract AaveV3Pipeline is Pipeline {
    using SafeERC20 for IERC20;
    uint256 public constant MAX_INT = 2**256 - 1;

    // Tokens used
    address public rewardToken;
    address public aToken;
    address public asset;

    // Third party contracts
    address public dataProvider;
    address public lendingPool;
    address public incentivesController;

    // Routes
    address public unirouter;
    address[] public rewardTokenToAssetRoute;

    uint256 public lastHarvest;
    uint256 public vaultDebt;

    // params
    address public allocator;
    uint256 public feeAmount; // 1 = 0.1%
    uint256 immutable feeDenom = 1000;
    address public feeRecipient;

    event DebugP(uint256 amount, string msg);

    constructor(
        bytes memory _pipelineParams,
        uint256 _feeAmount,
        address _asset,
        address _allocator,
        address _feeRecipient
    ) {
        (
            rewardToken,
            dataProvider, // "PoolDataProvider"
            lendingPool,
            incentivesController,
            unirouter
        ) = abi.decode(
            _pipelineParams,
            (address, address, address, address, address)
        );
        (aToken, , ) = IDataProvider(dataProvider).getReserveTokensAddresses(
            _asset
        );

        rewardTokenToAssetRoute = [rewardToken, asset];
        _giveAllowances();

        feeAmount = _feeAmount;
        asset = _asset;
        allocator = _allocator;
        feeRecipient = _feeRecipient;
    }

    function _deposit(uint256 _amount) internal override returns (uint256) {
        ILendingPool(lendingPool).deposit(asset, _amount, address(this), 0);
        return _amount; // No checks are needed as Aave doesn't have deposit fees
    }

    function _liquidate(uint256 _amount, uint256 _maxSlippage,  bool _panic)
        internal override
        returns (uint256 assetsRecovered)
    {
        uint256 vaultBalance = IERC20(asset).balanceOf(address(this));
        if (vaultBalance < _amount) {
            ILendingPool(lendingPool).withdraw(
                asset,
                _panic ? type(uint256).max : _amount - vaultBalance,
                address(this)
            );
            vaultBalance = IERC20(asset).balanceOf(address(this));
        }

        if (vaultBalance > _amount) {
            vaultBalance = _amount;
        }

        // Using msg.sender saves gas
        IERC20(asset).safeTransfer(msg.sender, vaultBalance);
        return (vaultBalance);
    }

    // Change this if there's no rewards
    function _harvestCompound(bool _harvest) internal override {
        address[] memory assets = new address[](1);
        assets[0] = aToken;
        // TODO: should we use the return value?
        if (_harvest) {
            IAaveV3Incentives(incentivesController).claimRewards(
                assets,
                type(uint256).max,
                address(this),
                rewardToken
            );

            // How much did we get?
            uint256 rewardBal = IERC20(rewardToken).balanceOf(address(this));
            if (rewardBal > 0) {
                _chargeFees();
                _swapRewards();
            }
        }

        // We deposit assets if some are available
        uint256 assetsToInvest = IERC20(asset).balanceOf(address(this));
        if (assetsToInvest > 0) {
            _deposit(assetsToInvest);
        }
    }

    // Views
    function _investedInPool() internal view override returns (uint256) {
        (uint256 supplyBal, , , , , , , , ) = IDataProvider(dataProvider)
            .getUserReserveData(asset, address(this));
        return supplyBal;
    }

    function _rewardsAvailable() internal view override returns (uint256) {
        address[] memory assets = new address[](1);
        assets[0] = aToken;
        return
            IAaveV3Incentives(incentivesController).getUserRewards(
                assets,
                address(this),
                rewardToken
            );
    }

    // Utils
    function _giveAllowances() internal override {
        IERC20(asset).safeApprove(lendingPool, type(uint256).max);
        IERC20(rewardToken).safeApprove(unirouter, type(uint256).max);
        IERC20(asset).safeApprove(allocator, type(uint256).max);
    }

    function _removeAllowances() internal override {
        IERC20(asset).safeApprove(lendingPool, 0);
        IERC20(asset).safeApprove(unirouter, 0);
    }

    function _chargeFees() internal {
        uint256 rewardTokenFeeBal = (IERC20(rewardToken).balanceOf(
            address(this)
        ) * feeAmount) / feeDenom;
        IERC20(rewardToken).safeTransfer(feeRecipient, rewardTokenFeeBal);
        emit chargedFees(rewardTokenFeeBal);
    }

    // Warning: tx will revert if the amount harvested is too low
    // And if we're swapping a stable with low amount of digits
    function _swapRewards() internal override {
        uint256 rewardTokenBal = IERC20(rewardToken).balanceOf(address(this));
        emit DebugP(rewardTokenBal, "rewardBal");
        IUniswapV2Router02(unirouter).swapExactTokensForTokens(
            rewardTokenBal,
            1,
            rewardTokenToAssetRoute,
            address(this),
            block.timestamp + 100
        );
    }
}
