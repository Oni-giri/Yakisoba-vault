// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.17;

// Utils
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

// Let's own the libs'
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";

// Interface
import "./interfaces/IStrategy.sol";
import "./interfaces/IBridgeConnectorRemote.sol";

/// @title Allocator
/** @notice Contract in charge of allocating assets to strategies (also called "strategies"),
 *  keep an accounting of the assets allocated and update the Yakisoba.
 *  @dev This contract can be deployed on the "home" chain where the yakisoba is located,
 *  as well as on a "remote chain".
 **/
contract Allocator is Initializable, OwnableUpgradeable {
	using SafeERC20 for IERC20;
	using Address for address;

	struct Strategy {
		string strategyName;
		bool whitelisted;
		uint256 maxDeposit;
		uint256 debt;
	}

	struct StrategyMap {
		string strategyName;
		uint256 maxDeposit;
		uint256 debt;
		uint256 totalAssetsAvailable;
		address entryPoint;
	}
	uint256 totalStrategysDebt;

	address[] public strategiesList;
	mapping(address => Strategy) public strategiesData;
	address public bridgeConnector;

	uint256 private constant MAX_UINT256 = 2 ** 256 - 1;
	uint256 public yakisobaChainId;
	address public asset; // The asset address that we'll receive and we'll send back

	event Withdraw(uint256 request, uint256 recovered, address receiver);
	event ChainDebtUpdate(uint256 newDebt);
	event StrategyAdded(
		address entryPoint,
		uint256 maxDeposit,
		string strategyName
	);
	event MaxDepositUpdated(address strategyAddress, uint256 maxDeposit);
	event StratPositionUpdated(
		uint256 currentIndex,
		uint256 newIndex,
		address stratAddress
	);
	event BridgeSuccess(uint256 amount, uint256 yakisobaChainId);
	event StrategyUpdate(address strategy, uint256 newDebt);

	event DepositInStrategy(uint256 amount, address strategy);
	// AmountMoved corresponds to the withdraw/deposit size
	event Losses(address strategy, uint256 loss, uint256 amountMoved);
	event BridgeUpdated(address newBridge);

	error CantUpdateYakisoba();
	error NotWhitelisted();
	error MaxDepositReached(address strategy);
	error StrategyAlreadyExists();
	error AddressIsZero();
	error AddressIsNotContract();
	error IncorrectArrayLengths();

	function initialize(
		address _asset,
		uint256 _yakisobaChainId
	) public initializer {
		asset = _asset;
		yakisobaChainId = _yakisobaChainId;
		__Ownable_init();
	}

	modifier onlyWhitelisted(address _strategy) {
		isWhitelisted(_strategy);
		_;
	}

	/// @notice Send back funds to the yakisoba
	/// @dev No need to add a 'value" field if we're on the home chain
	/// @param _amount amount of assets we want to send back
	/// @param _minAmount minimum amount of assets we want to send back
	function bridgeBackFunds(
		uint256 _amount,
		uint256 _minAmount
	) external payable onlyOwner {
		address bc = bridgeConnector;

		//We send assets to the bridge/yakisoba
		IERC20(asset).safeTransfer(bc, _amount);

		if (block.chainid != yakisobaChainId) {
			IBridgeConnectorRemote(bc).bridgeFunds{ value: msg.value }(
				_amount,
				_minAmount
			);
		} else {
			// We update the yakisoba directly if we're on the same chain
			_updateYakisoba();
		}

		emit BridgeSuccess(_amount, yakisobaChainId);
	}

	/** @notice ask a strategy to liquidate some or all of its position
	 * @dev Given that some positions may be illiquid, this function may not allow you
	 *  to recover all of the requested amount. However, the strategy should start the liquidation
	 *  process.
	 * @param _amount The amount we want to recover
	 * @param _maxSlippage The maximum slippage we accept as a loss
	 * @param _strategy The targeted strategy
	 * @param _panic Use if we need to withdraw everything now
	 **/
	function liquidateStrategy(
		uint256 _amount,
		uint256 _maxSlippage, // 1% = 100
		address _strategy,
		bool _panic
	) external onlyOwner onlyWhitelisted(_strategy) {
		_liquidateStrategy(_amount, _maxSlippage, _strategy, _panic);
		emit ChainDebtUpdate(totalChainDebt());
	}

	function _liquidateStrategy(
		uint256 _amount,
		uint256 _maxSlippage, // 1% = 100
		address _strategy,
		bool _panic
	) internal {
		uint256 debt = strategiesData[_strategy].debt;
		// Liquidate should pull the maximum possible funds and forward everything
		// to the Allocator
		try
			IStrategy(_strategy).liquidate(_amount, _maxSlippage, _panic)
		returns (uint256 assetsRecovered, uint256 newDebt) {
			totalStrategysDebt -= (debt - Math.min(debt, newDebt));
			strategiesData[_strategy].debt = newDebt;
		} catch {
			// We pull any funds that stayed in the contract
			uint256 strategyBalance = IERC20(asset).balanceOf(_strategy);
			if (strategyBalance > 0) {
				IERC20(asset).safeTransferFrom(
					_strategy,
					address(this),
					strategyBalance
				);
				uint256 newDebt = debt - Math.min(debt, strategyBalance);
				strategiesData[_strategy].debt = newDebt;
				totalStrategysDebt -= Math.min(
					totalStrategysDebt,
					strategyBalance
				);
			}
		}
		emit StrategyUpdate(_strategy, strategiesData[_strategy].debt);
	}

	/// @notice Close a strategy malfunctionning, that lost funds, or that isn't used anymore
	/// @dev It can still be liquidated if some funds are stuck there
	/// @param _strategy address of the targeted strategy
	function retireStrategy(
		address _strategy
	) external onlyOwner onlyWhitelisted(_strategy) {
		_liquidateStrategy(MAX_UINT256, 0, _strategy, true);
		strategiesData[_strategy].maxDeposit = 0;
		strategiesData[_strategy].debt = 0;
	}

	/// @notice Send assets to the desired strategies
	/// @dev Batching allows us to save gas
	/// @param _amounts Array containing the amount we send for each strategy
	/// @param _strategies Array containing the strategies addresses
	function dispatchAssets(
		uint256[] calldata _amounts,
		address[] calldata _strategies
	) external onlyOwner {
		if (_amounts.length != _strategies.length) {
			revert IncorrectArrayLengths();
		}
		for (uint256 i; i < _amounts.length; i++) {
			Strategy storage strategyData = strategiesData[_strategies[i]];
			isWhitelisted(_strategies[i]);

			uint256 debt = strategyData.debt;

			if (strategyData.maxDeposit <= debt + _amounts[i])
				revert MaxDepositReached(_strategies[i]);

			strategyData.debt += _amounts[i];
			totalStrategysDebt += _amounts[i];

			IERC20(asset).safeTransfer(_strategies[i], _amounts[i]);

			emit StrategyUpdate(_strategies[i], debt += _amounts[i]);
		}

		emit ChainDebtUpdate(totalChainDebt());
	}

	/// @notice Allows a strategy to communicate the amount of assets it holds
	/// @param _newDebt New amount of assets in strategy
	function updateStrategyDebt(
		uint256 _newDebt
	) external onlyWhitelisted(msg.sender) {
		uint256 oldDebt = strategiesData[msg.sender].debt;

		oldDebt < _newDebt
			? totalStrategysDebt += _newDebt - oldDebt
			: totalStrategysDebt -= Math.min(
			oldDebt - _newDebt,
			totalStrategysDebt
		);
		strategiesData[msg.sender].debt = _newDebt;

		emit StrategyUpdate(msg.sender, _newDebt);
		emit ChainDebtUpdate(totalChainDebt());
	}

	/// @notice Communicate to the yakisoba the total amount of assets managed by the allocator
	/// @dev You'll need to send some 'value' to pay for the cross-chain message
	function updateYakisoba() external payable onlyOwner {
		_updateYakisoba();
	}

	function _updateYakisoba() internal {
		uint256 debt = totalChainDebt();
		IBridgeConnectorRemote(bridgeConnector).updateChainDebt{
			value: msg.value
		}(block.chainid, debt);
		emit ChainDebtUpdate(debt);
	}

	/// @notice Sets a new bridge connector for the allocator
	function setBridge(address _newBridgeConnector) external onlyOwner {
		if (block.chainid == yakisobaChainId && bridgeConnector != address(0)) {
			revert CantUpdateYakisoba(); // We don't want to change the bridge if we're on the yakisoba chain
		}

		bridgeConnector = _newBridgeConnector;

		emit BridgeUpdated(_newBridgeConnector);
	}

	/// @notice Add a new strategy with which the allocator can interact
	/// @param _entryPoint Strategy address
	/// @param _maxDeposit Maximum amount of assets we can deposit
	/// @param _strategyName Strategy name, to help identify it
	function addNewStrategy(
		address _entryPoint,
		uint256 _maxDeposit,
		string calldata _strategyName
	) external onlyOwner {
		if (strategiesData[_entryPoint].whitelisted)
			revert StrategyAlreadyExists();
		if (_entryPoint.isContract() == false) revert AddressIsNotContract();

		strategiesList.push(_entryPoint);
		strategiesData[_entryPoint] = Strategy({
			strategyName: _strategyName,
			whitelisted: true,
			maxDeposit: _maxDeposit,
			debt: 0
		});
		emit StrategyAdded(_entryPoint, _maxDeposit, _strategyName);
	}

	/// @notice Change maximum deposit amount
	/// @param _strategyAddress Strategy address
	/// @param _maxDeposit Maximum deposit
	function setMaxDeposit(
		address _strategyAddress,
		uint256 _maxDeposit
	) external onlyOwner {
		strategiesData[_strategyAddress].maxDeposit = _maxDeposit;
		emit MaxDepositUpdated(_strategyAddress, _maxDeposit);
	}

	/// @notice Total amount managed by the allocator
	/// @dev We don't compute on the fly the amount stored in each strategy to save on gas
	function totalChainDebt() public view returns (uint256) {
		return totalStrategysDebt + IERC20(asset).balanceOf(address(this));
	}

	/// @notice View function allowing to have a synthetic view of the strategies
	/// @dev See StrategyMap struct to understand the return object
	function strategyMap() external view returns (StrategyMap[] memory) {
		uint256 len = strategiesList.length;
		StrategyMap[] memory map = new StrategyMap[](len);

		for (uint256 i = 0; i < len; i++) {
			address entryPoint = strategiesList[i];
			Strategy memory strategy = strategiesData[entryPoint];

			map[i] = StrategyMap({
				strategyName: strategy.strategyName,
				entryPoint: entryPoint,
				maxDeposit: strategy.maxDeposit,
				debt: strategy.debt,
				totalAssetsAvailable: IStrategy(entryPoint).totalBalance()
			});
		}
		return map;
	}

	function isWhitelisted(address _strategy) internal view {
		if (strategiesData[_strategy].whitelisted == false)
			revert NotWhitelisted();
	}
}
