// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./utils/SwapUtils.sol";
import "./utils/AmplificationUtils.sol";

// Sturdy rewards interface
import "./interfaces/ISturdyIncentivesController.sol";
import "./interfaces/ILendingPool.sol";

/**
 * @title Swap - A StableSwap implementation in solidity.
 * @notice This contract is responsible for custody of closely pegged assets (eg. group of stablecoins)
 * and automatic market making system. Users become an LP (Liquidity Provider) by depositing their tokens
 * in desired ratios for an exchange of the pool token that represents their share of the pool.
 * Users can burn pool tokens and withdraw their share of token(s).
 *
 * Each time a swap between the pooled tokens happens, a set fee incurs which effectively gets
 * distributed to the LPs.
 *
 * In case of emergencies, admin can pause additional deposits, swaps, or single-asset withdraws - which
 * stops the ratio of the tokens in the pool from changing.
 * Users can always withdraw their tokens via multi-asset withdraws.
 *
 * @dev Most of the logic is stored as a library `SwapUtils` for the sake of reducing contract's
 * deployment size.
 */
contract Swap is Ownable {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;
	using SwapUtils for SwapUtils.Swap;
	using AmplificationUtils for SwapUtils.Swap;

	// Struct storing data responsible for automatic market maker functionalities. In order to
	// access this data, this contract uses SwapUtils library. For more details, see SwapUtils.sol
	SwapUtils.Swap public swapStorage;

	// constants
	uint256 private constant MAX_UINT256 = 2 ** 256 - 1;
	uint8 private constant VIRTUAL_ASSET_INDEX = 0;
	uint8 private constant REAL_ASSET_INDEX = 1;
	uint8 private constant POOL_LENGTH = 2;
	uint8 private constant MAX_UINT8 = 2 ** 8 - 1;

	address public immutable CRATE; // The yakisoba that interacts with the pool
	IERC20[] public UNDERLYING_TOKENS; // The tokens going in/out of the contract during swaps
	ILendingPool public immutable LENDING_POOL;
	ISturdyIncentivesController public incentivesController;
	address public rewardsManager;

	// Maps token address to an index in the pool. Used to prevent duplicate tokens in the pool.
	// getTokenIndex function also relies on this mapping to retrieve token index.
	mapping(address => uint8) private tokenIndexes;

	bool public migrated;

	mapping(uint8 => bool) private isUnderlyingIndex;

	/*** EVENTS ***/

	event RampA(
		uint256 oldA,
		uint256 newA,
		uint256 initialTime,
		uint256 futureTime
	);
	event StopRampA(uint256 currentA, uint256 time);
	event RewardsConfigSet(address controller, address manager);
	event MigrationWithdrawFailed(uint256 aTokenBalance);

	error WrongLength();
	error WrongToken();
	error WrongIndex();
	error WrongDecimals(uint8 decimals, uint256 index);
	error WrongAFactor(uint256 a);
	error DeadlineCheck(uint256 deadline, uint256 blockTimestamp);
	error OnlyYakisoba();

	error WrongBalance(uint256 balance, uint256 expected);
	error MigrationError();
	error ZeroAmount();

	/**
	 * @notice Initializes this Swap contract with the given parameters.
	 * This will also clone a LPToken contract that represents users'
	 * LP positions. The owner of LPToken will be this contract - which means
	 * only this contract is allowed to mint/burn tokens.
	 *
	 * @param _pooledTokens an array of ERC20s this pool will accept
	 * @param _decimals the decimals to use for each pooled token,
	 * eg 8 for WBTC. Cannot be larger than POOL_PRECISION_DECIMALS
	 * @param _a the amplification coefficient * n * (n - 1). See the
	 * StableSwap paper for details
	 */
	constructor(
		IERC20[] memory _pooledTokens,
		IERC20[] memory _underlyingTokens,
		uint8[] memory _decimals,
		uint256 _a,
		address _lendingPool,
		address _yakisoba
	) {
		// Check _pooledTokens and precisions parameter
		// _pooledTokens, _underlyingTokens
		// and _decimals must have the same length
		if (
			_pooledTokens.length != POOL_LENGTH ||
			_decimals.length != POOL_LENGTH ||
			_underlyingTokens.length != POOL_LENGTH
		) {
			revert WrongLength();
		}

		// Check _pooledTokens parameter
		if (
			address(_pooledTokens[REAL_ASSET_INDEX]) == address(0) || // case 1
			address(_underlyingTokens[REAL_ASSET_INDEX]) == address(0) || // case 2
			address(_underlyingTokens[VIRTUAL_ASSET_INDEX]) != address(0) || // case 3
			address(_pooledTokens[VIRTUAL_ASSET_INDEX]) != address(0) // case 4
		) {
			revert WrongToken();
		}

		// Check _a, _fee, _adminFee parameters
		if (_a > AmplificationUtils.MAX_A) {
			revert WrongAFactor(_a); // a exceeds maximum A
		}

		// Check _decimals parameter
		uint256[] memory precisionMultipliers = new uint256[](_decimals.length);
		for (uint8 i = 0; i < POOL_LENGTH; ++i) {
			if (_decimals[i] > SwapUtils.POOL_PRECISION_DECIMALS) {
				revert WrongDecimals(_decimals[i], i);
			} // Token decimals exceeds maximum precision

			precisionMultipliers[i] =
				10 **
					uint256(SwapUtils.POOL_PRECISION_DECIMALS).sub(
						uint256(_decimals[i])
					);

			tokenIndexes[address(_pooledTokens[i])] = i;
		}

		// Initialize swapStorage struct
		swapStorage.pooledTokens = _pooledTokens;
		swapStorage.tokenPrecisionMultipliers = precisionMultipliers;
		swapStorage.balances = new uint256[](_pooledTokens.length);
		swapStorage.initialA = _a.mul(AmplificationUtils.A_PRECISION);
		swapStorage.futureA = _a.mul(AmplificationUtils.A_PRECISION);

		// We set the parameters to interact with Aave and the yakisoba
		LENDING_POOL = ILendingPool(_lendingPool);
		CRATE = _yakisoba;

		// Set unlimited approvals
		_underlyingTokens[REAL_ASSET_INDEX].approve(_lendingPool, MAX_UINT256);
		UNDERLYING_TOKENS = _underlyingTokens;
	}

	/*** MODIFIERS ***/

	/**
	 * @notice Modifier to check deadline against current timestamp
	 * @param deadline latest timestamp to accept this transaction
	 */
	modifier deadlineCheck(uint256 deadline) {
		if (deadline < block.timestamp) {
			revert DeadlineCheck(deadline, block.timestamp);
		}
		_;
	}

	modifier onlyYakisoba() {
		if (msg.sender != CRATE) {
			revert OnlyYakisoba();
		}
		_;
	}

	/*** VIEW FUNCTIONS ***/

	/**
	 * @notice Return A, the amplification coefficient * n * (n - 1)
	 * @dev See the StableSwap paper for details
	 * @return A parameter
	 */
	function getA() external view virtual returns (uint256) {
		return swapStorage.getA();
	}

	/**
	 * @notice Return A in its raw precision form
	 * @dev See the StableSwap paper for details
	 * @return A parameter in its raw precision form
	 */
	function getAPrecise() external view virtual returns (uint256) {
		return swapStorage.getAPrecise();
	}

	/**
	 * @notice Return address of the pooled token at given index. Reverts if tokenIndex is out of range.
	 * @param index the index of the token
	 * @return address of the token at given index
	 */
	function getPooledToken(uint8 index) public view virtual returns (IERC20) {
		if (index >= swapStorage.pooledTokens.length) {
			revert WrongIndex();
		}
		return swapStorage.pooledTokens[index];
	}

	/**
	 * @notice Return the index of the given token address. Reverts if no matching
	 * token is found.
	 * @param tokenAddress address of the token
	 * @return the index of the given token address
	 */
	function getPooledTokenIndex(
		address tokenAddress
	) public view virtual returns (uint8) {
		uint8 index = tokenIndexes[tokenAddress];
		if (address(getPooledToken(index)) != tokenAddress) {
			revert WrongToken();
		}
		return index;
	}

	/**
	 * @notice Return current balance of the pooled token at given index
	 * @param index the index of the token
	 * @return current balance of the pooled token at given index with token's native precision
	 */
	function getTokenBalance(
		uint8 index
	) external view virtual returns (uint256) {
		if (index >= swapStorage.pooledTokens.length) {
			revert WrongIndex();
		}
		return swapStorage.balances[index];
	}

	function getAssetBalance() external view returns (uint256) {
		return swapStorage.balances[REAL_ASSET_INDEX];
	}

	/**
	 * @notice Get the virtual price, to help calculate profit
	 * @return the virtual price, scaled to the POOL_PRECISION_DECIMALS
	 */
	function getVirtualPrice() external view virtual returns (uint256) {
		return swapStorage.getVirtualPrice();
	}

	/**
	 * @notice Calculate amount of tokens you receive on swap
	 * @param tokenIndexFrom the token the user wants to sell
	 * @param tokenIndexTo the token the user wants to buy
	 * @param dx the amount of tokens the user wants to sell. If the token charges
	 * a fee on transfers, use the amount that gets transferred after the fee.
	 * @return amount of tokens the user will receive
	 */
	function calculateSwap(
		uint8 tokenIndexFrom,
		uint8 tokenIndexTo,
		uint256 dx
	) external view virtual returns (uint256) {
		return swapStorage.calculateSwap(tokenIndexFrom, tokenIndexTo, dx);
	}

	/// @notice Calculate conversion of assets to virtual debt
	/// @param dx amount to convert
	/// returns amount converted
	function calculateAssetToVirtual(
		uint256 dx
	) external view returns (uint256) {
		return
			swapStorage.calculateSwap(
				REAL_ASSET_INDEX,
				VIRTUAL_ASSET_INDEX,
				dx
			);
	}

	/// @notice Calculate conversion of virtual debt to assets
	/// @param dx amount to convert
	/// returns amount converted
	function calculateVirtualToAsset(
		uint256 dx
	) external view returns (uint256) {
		return
			swapStorage.calculateSwap(
				VIRTUAL_ASSET_INDEX,
				REAL_ASSET_INDEX,
				dx
			);
	}

	/**
	 * @notice This function reads the accumulated amount of admin fees of the token with given index
	 * @return admin's token balance in the token's precision
	 **/
	function getReturnsBalance() external view virtual returns (uint256) {
		return swapStorage.getReturnsBalance(REAL_ASSET_INDEX);
	}

	/*** STATE MODIFYING FUNCTIONS ***/

	/**
	 * @notice This function is a wrapper for _swap, allowing to easily swap "virtual" tokens for assets
	 * @param _dx Amount of virtual token input for the swap
	 * @param _minDy Minimum amount we should receive
	 * @param _deadline Maximum time after which the tx reverts
	 * @param _receiver Who should receive the output assets
	 * return dy Amount of output assets
	 */
	function swapVirtualToAsset(
		uint256 _dx,
		uint256 _minDy,
		uint256 _deadline,
		address _receiver
	) external deadlineCheck(_deadline) onlyYakisoba returns (uint256 dy) {
		// If we are swapping 0, we return 0
		if (_dx == 0) {
			return 0;
		}

		dy = swapStorage._swap(
			VIRTUAL_ASSET_INDEX,
			REAL_ASSET_INDEX,
			_dx,
			_minDy
		);

		LENDING_POOL.withdraw(
			address(UNDERLYING_TOKENS[REAL_ASSET_INDEX]),
			dy,
			_receiver
		);

		// And we withdraw and send them to the recipient
		return dy;
	}

	/**
	 * @notice This function is a wrapper for _swap, allowing to easily swap assets for "virtual" tokens
	 * @dev This function is only callable by the yakisoba
	 * @dev We don't specify a min dx because it should be calculated by the yakisoba
	 * @param _dx Amount of assets input for the swap
	 * return dy Amount of output virtual tokens
	 */
	function swapAssetToVirtual(
		uint256 _dx,
		uint256 _deadline
	) external onlyYakisoba deadlineCheck(_deadline) returns (uint256) {
		// If we are swapping 0, we return 0
		if (_dx == 0) {
			return 0;
		}
		// We get the tokens
		{
			UNDERLYING_TOKENS[REAL_ASSET_INDEX].safeTransferFrom(
				msg.sender,
				address(this),
				_dx
			);
		}
		// We deposit them in Aave for aTokens
		LENDING_POOL.deposit(
			address(UNDERLYING_TOKENS[REAL_ASSET_INDEX]),
			_dx,
			address(this),
			0
		);

		// We swap
		uint256 dy = swapStorage._swap(
			REAL_ASSET_INDEX,
			VIRTUAL_ASSET_INDEX,
			_dx,
			0
		);

		return dy;
	}

	/// @notice Because we just need the LP for accounting, the balance is virtualized
	/// @return virtualLpBalance
	function getVirtualLpBalance() external view returns (uint256) {
		return swapStorage.virtualLpBalance;
	}

	/**
	 * @notice Add liquidity to the pool with the given amounts of tokens
	 * @param amount the amounts of token to add, in its native precision
	 * @param deadline latest timestamp to accept this transaction
	 * @return amount of LP token user minted and received
	 */
	function addLiquidity(
		uint256 amount,
		uint256 deadline
	) external virtual onlyYakisoba deadlineCheck(deadline) returns (uint256) {
		// Aave should revert with a cryptic message but we check anyway
		if (amount == 0) revert ZeroAmount();
		uint256[] memory amounts = new uint256[](2);
		amounts[REAL_ASSET_INDEX] = amount;
		amounts[VIRTUAL_ASSET_INDEX] = amount;

		UNDERLYING_TOKENS[REAL_ASSET_INDEX].safeTransferFrom(
			msg.sender,
			address(this),
			amount
		);

		// Aave deposit
		LENDING_POOL.deposit(
			address(UNDERLYING_TOKENS[REAL_ASSET_INDEX]),
			amount,
			address(this),
			0
		);

		uint256 toReturn = swapStorage._addLiquidity(amounts, 0);

		// We ensure that the actual balance is the same as the one recorded
		// We add 1 wei to account for rounding errors on Aave's side
		uint256 balance = swapStorage.pooledTokens[REAL_ASSET_INDEX].balanceOf(
			address(this)
		);
		uint256 expectedBalance = swapStorage.balances[REAL_ASSET_INDEX];

		if (balance + 1 < expectedBalance) {
			revert WrongBalance(balance, expectedBalance);
		} else if (balance + 1 == expectedBalance) {
			// We update the balance to the actual one to account for rounding errors
			swapStorage.balances[REAL_ASSET_INDEX] = balance;
		}

		return toReturn;
	}

	/**
	 * @notice Burn LP tokens to remove liquidity from the pool. Withdraw fee that decays linearly
	 * over period of 4 weeks since last deposit will apply.
	 * @dev Liquidity can always be removed, even when the pool is paused.
	 * @param amount the amount of LP tokens to burn
	 * @param deadline latest timestamp to accept this transaction
	 * @return recovered amount of tokens user received
	 */
	function removeLiquidity(
		uint256 amount,
		uint256 deadline
	)
		external
		virtual
		onlyYakisoba
		deadlineCheck(deadline)
		returns (uint256 recovered)
	{
		if (amount == 0) revert ZeroAmount();
		uint256[] memory minAmounts = new uint256[](2);
		uint256[] memory amounts = swapStorage._removeLiquidity(
			amount,
			minAmounts
		);

		// And we withdraw and send them to the recipient
		LENDING_POOL.withdraw(
			address(UNDERLYING_TOKENS[REAL_ASSET_INDEX]),
			amounts[REAL_ASSET_INDEX],
			msg.sender
		);

		return amounts[REAL_ASSET_INDEX];
	}

	/*** ADMIN FUNCTIONS ***/

	/**
	 * @notice Withdraw all returns to the contract owner
	 */
	function withdrawUnderlyingReturns() external onlyOwner {
		uint256 realBalance = swapStorage
			.pooledTokens[REAL_ASSET_INDEX]
			.balanceOf(address(this));
		uint256 recordedBalance = swapStorage.balances[REAL_ASSET_INDEX];
		if (realBalance > recordedBalance) {
			LENDING_POOL.withdraw(
				address(UNDERLYING_TOKENS[REAL_ASSET_INDEX]),
				realBalance - recordedBalance,
				msg.sender
			);
		}
	}

	function claimRewards() external onlyOwner returns (uint256) {
		address[] memory assets = new address[](1);
		assets[0] = address(swapStorage.pooledTokens[REAL_ASSET_INDEX]);

		return (
			incentivesController.claimRewards(
				assets,
				incentivesController.getRewardsBalance(assets, address(this)),
				rewardsManager
			)
		);
	}

	function setRewardsConfig(
		address _controller,
		address _manager
	) external onlyOwner {
		incentivesController = ISturdyIncentivesController(_controller);
		rewardsManager = _manager;
		emit RewardsConfigSet(_controller, _manager);
	}

	/**
	 * @notice Start ramping up or down A parameter towards given futureA and futureTime
	 * Checks if the change is too rapid, and commits the new A value only when it falls under
	 * the limit range.
	 * @param futureA the new A to ramp towards
	 * @param futureTime timestamp when the new A should be reached
	 */
	function rampA(uint256 futureA, uint256 futureTime) external onlyOwner {
		swapStorage.rampA(futureA, futureTime);
	}

	/**
	 * @notice Stop ramping A immediately. Reverts if ramp A is already stopped.
	 */
	function stopRampA() external onlyOwner {
		swapStorage.stopRampA();
	}

	/**
	 * @notice Migrate the pool to another one
	 * @dev If there isn't enough assets in the lending pool, try first to remove liquidity
	 */
	function migrate() external onlyYakisoba {
		if (migrated) {
			revert MigrationError();
		}
		// We withdraw and send back the asset
		IERC20 aToken = swapStorage.pooledTokens[REAL_ASSET_INDEX];
		IERC20 realAsset = UNDERLYING_TOKENS[REAL_ASSET_INDEX];
		uint256 aTokenBalance = aToken.balanceOf(address(this));

		// We use a try/catch to avoid reverts
		try
			LENDING_POOL.withdraw(address(realAsset), aTokenBalance, CRATE)
		{} catch {
			emit MigrationWithdrawFailed(aTokenBalance);
		}
		migrated = true;
	}

	/// @notice Recover assets from the pool
	/// @dev If we have migrated but there are still assets in the lending pool,
	/// this adds a mechanism to recover them.
	/// @param _amount the amount of assets to recover
	function recoverAssets(uint256 _amount) external onlyOwner {
		if (!migrated) {
			revert MigrationError();
		}
		LENDING_POOL.withdraw(
			address(UNDERLYING_TOKENS[REAL_ASSET_INDEX]),
			_amount,
			CRATE
		);
	}
}
