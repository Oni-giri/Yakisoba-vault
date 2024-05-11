// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./AmplificationUtils.sol";
import "./MathUtils.sol";

/**
 * @title SwapUtils library
 * @notice A library to be used within Swap.sol. Contains functions responsible for custody and AMM functionalities.
 * @dev Contracts relying on this library must initialize SwapUtils.Swap struct then use this library
 * for SwapUtils.Swap struct. Note that this library contains both functions called by users and admins.
 * Admin functions should be protected within contracts using this library.
 */

library SwapUtils {
	using SafeERC20 for IERC20;
	using SafeMath for uint256;
	using MathUtils for uint256;

	/*** EVENTS ***/

	event TokenSwap(
		address indexed buyer,
		uint256 tokensSold,
		uint256 tokensBought,
		uint128 soldId,
		uint128 boughtId
	);
	event AddLiquidity(
		address indexed provider,
		uint256[] tokenAmounts,
		uint256 invariant,
		uint256 lpTokenSupply
	);
	event RemoveLiquidity(
		address indexed provider,
		uint256[] tokenAmounts,
		uint256 lpTokenSupply
	);

	event DebugSwap(uint256 x, string y);

	struct Swap {
		// variables around the ramp management of A,
		// the amplification coefficient * n * (n - 1)
		// see https://www.curve.fi/stableswap-paper.pdf for details
		uint256 initialA;
		uint256 futureA;
		uint256 initialATime;
		uint256 futureATime;
		// We use a virtual LP token to calculate the liquidity
		uint256 virtualLpBalance;
		// contract references for all tokens being pooled
		IERC20[] pooledTokens;
		// multipliers for each pooled token's precision to get to POOL_PRECISION_DECIMALS
		// for example, TBTC has 18 decimals, so the multiplier should be 1. WBTC
		// has 8, so the multiplier should be 10 ** 18 / 10 ** 8 => 10 ** 10
		uint256[] tokenPrecisionMultipliers;
		// the pool balance of each token, in the token's precision
		// the contract's actual token balance might differ
		uint256[] balances;
	}

	// Struct storing variables used in calculations in the
	// calculateWithdrawOneTokenDY function to avoid stack too deep errors
	struct CalculateWithdrawOneTokenDYInfo {
		uint256 d0;
		uint256 d1;
		uint256 newY;
		uint256 feePerToken;
		uint256 preciseA;
	}

	// Struct storing variables used in calculations in the
	// {add,remove}Liquidity functions to avoid stack too deep errors
	struct ManageLiquidityInfo {
		uint256 d0;
		uint256 d1;
		uint256 d2;
		uint256 preciseA;
		uint256 totalSupply;
		uint256[] balances;
		uint256[] multipliers;
	}

	// the precision all pools tokens will be converted to
	uint8 public constant POOL_PRECISION_DECIMALS = 18;

	// Constant value used as max loop limit
	uint256 private constant MAX_LOOP_LIMIT = 256;

	/*** VIEW & PURE FUNCTIONS ***/

	function _getAPrecise(Swap storage self) internal view returns (uint256) {
		return AmplificationUtils._getAPrecise(self);
	}

	/**
	 * @notice Calculate the price of a token in the pool with given
	 * precision-adjusted balances and a particular D.
	 *
	 * @dev This is accomplished via solving the invariant iteratively.
	 * See the StableSwap paper and Curve.fi implementation for further details.
	 *
	 * x_1**2 + x1 * (sum' - (A*n**n - 1) * D / (A * n**n)) = D ** (n + 1) / (n ** (2 * n) * prod' * A)
	 * x_1**2 + b*x_1 = c
	 * x_1 = (x_1**2 + c) / (2*x_1 + b)
	 *
	 * @param a the amplification coefficient * n * (n - 1). See the StableSwap paper for details.
	 * @param tokenIndex Index of token we are calculating for.
	 * @param xp a precision-adjusted set of pool balances. Array should be
	 * the same cardinality as the pool.
	 * @param d the stableswap invariant
	 * @return the price of the token, in the same precision as in xp
	 */
	function getYD(
		uint256 a,
		uint8 tokenIndex,
		uint256[] memory xp,
		uint256 d
	) internal pure returns (uint256) {
		uint256 numTokens = xp.length;
		require(tokenIndex < numTokens, "Token not found");

		uint256 c = d;
		uint256 s;
		uint256 nA = a.mul(numTokens);

		for (uint256 i = 0; i < numTokens; i++) {
			if (i != tokenIndex) {
				s = s.add(xp[i]);
				c = c.mul(d).div(xp[i].mul(numTokens));
				// If we were to protect the division loss we would have to keep the denominator separate
				// and divide at the end. However this leads to overflow with large numTokens or/and D.
				// c = c * D * D * D * ... overflow!
			}
		}
		c = c.mul(d).mul(AmplificationUtils.A_PRECISION).div(nA.mul(numTokens));

		uint256 b = s.add(d.mul(AmplificationUtils.A_PRECISION).div(nA));
		uint256 yPrev;
		uint256 y = d;
		for (uint256 i = 0; i < MAX_LOOP_LIMIT; i++) {
			yPrev = y;
			y = y.mul(y).add(c).div(y.mul(2).add(b).sub(d));
			if (y.within1(yPrev)) {
				return y;
			}
		}
		revert("Approximation did not converge");
	}

	/**
	 * @notice Get D, the StableSwap invariant, based on a set of balances and a particular A.
	 * @param xp a precision-adjusted set of pool balances. Array should be the same cardinality
	 * as the pool.
	 * @param a the amplification coefficient * n * (n - 1) in A_PRECISION.
	 * See the StableSwap paper for details
	 * @return the invariant, at the precision of the pool
	 */
	function getD(
		uint256[] memory xp,
		uint256 a
	) internal pure returns (uint256) {
		uint256 numTokens = xp.length;
		uint256 s;
		for (uint256 i = 0; i < numTokens; i++) {
			s = s.add(xp[i]);
		}
		if (s == 0) {
			return 0;
		}

		uint256 prevD;
		uint256 d = s;
		uint256 nA = a.mul(numTokens);

		for (uint256 i = 0; i < MAX_LOOP_LIMIT; i++) {
			uint256 dP = d;
			for (uint256 j = 0; j < numTokens; j++) {
				dP = dP.mul(d).div(xp[j].mul(numTokens));
				// If we were to protect the division loss we would have to keep the denominator separate
				// and divide at the end. However this leads to overflow with large numTokens or/and D.
				// dP = dP * D * D * D * ... overflow!
			}
			prevD = d;
			d = nA
				.mul(s)
				.div(AmplificationUtils.A_PRECISION)
				.add(dP.mul(numTokens))
				.mul(d)
				.div(
					nA
						.sub(AmplificationUtils.A_PRECISION)
						.mul(d)
						.div(AmplificationUtils.A_PRECISION)
						.add(numTokens.add(1).mul(dP))
				);
			if (d.within1(prevD)) {
				return d;
			}
		}

		// Convergence should occur in 4 loops or less. If this is reached, there may be something wrong
		// with the pool. If this were to occur repeatedly, LPs should withdraw via `removeLiquidity()`
		// function which does not rely on D.
		revert("D does not converge");
	}

	/**
	 * @notice Given a set of balances and precision multipliers, return the
	 * precision-adjusted balances.
	 *
	 * @param balances an array of token balances, in their native precisions.
	 * These should generally correspond with pooled tokens.
	 *
	 * @param precisionMultipliers an array of multipliers, corresponding to
	 * the amounts in the balances array. When multiplied together they
	 * should yield amounts at the pool's precision.
	 *
	 * @return an array of amounts "scaled" to the pool's precision
	 */
	function _xp(
		uint256[] memory balances,
		uint256[] memory precisionMultipliers
	) internal pure returns (uint256[] memory) {
		uint256 numTokens = balances.length;
		require(
			numTokens == precisionMultipliers.length,
			"Balances must match multipliers"
		);
		uint256[] memory xp = new uint256[](numTokens);
		for (uint256 i = 0; i < numTokens; i++) {
			xp[i] = balances[i].mul(precisionMultipliers[i]);
		}
		return xp;
	}

	/**
	 * @notice Return the precision-adjusted balances of all tokens in the pool
	 * @param self Swap struct to read from
	 * @return the pool balances "scaled" to the pool's precision, allowing
	 * them to be more easily compared.
	 */
	function _xp(Swap storage self) internal view returns (uint256[] memory) {
		return _xp(self.balances, self.tokenPrecisionMultipliers);
	}

	/**
	 * @notice Get the virtual price, to help calculate profit
	 * @param self Swap struct to read from
	 * @return the virtual price, scaled to precision of POOL_PRECISION_DECIMALS
	 */
	function getVirtualPrice(
		Swap storage self
	) external view returns (uint256) {
		uint256 d = getD(_xp(self), _getAPrecise(self));
		uint256 supply = self.virtualLpBalance;
		if (supply > 0) {
			return d.mul(10 ** uint256(POOL_PRECISION_DECIMALS)).div(supply);
		}
		return 0;
	}

	/**
	 * @notice Calculate the new balances of the tokens given the indexes of the token
	 * that is swapped from (FROM) and the token that is swapped to (TO).
	 * This function is used as a helper function to calculate how much TO token
	 * the user should receive on swap.
	 *
	 * @param preciseA precise form of amplification coefficient
	 * @param tokenIndexFrom index of FROM token
	 * @param tokenIndexTo index of TO token
	 * @param x the new total amount of FROM token
	 * @param xp balances of the tokens in the pool
	 * @return the amount of TO token that should remain in the pool
	 */
	function getY(
		uint256 preciseA,
		uint8 tokenIndexFrom,
		uint8 tokenIndexTo,
		uint256 x,
		uint256[] memory xp
	) internal pure returns (uint256) {
		uint256 numTokens = xp.length;
		require(
			tokenIndexFrom != tokenIndexTo,
			"Can't compare token to itself"
		);
		require(
			tokenIndexFrom < numTokens && tokenIndexTo < numTokens,
			"Tokens must be in pool"
		);

		uint256 d = getD(xp, preciseA);
		uint256 c = d;
		uint256 s;
		uint256 nA = numTokens.mul(preciseA);

		uint256 _x;
		for (uint256 i = 0; i < numTokens; i++) {
			if (i == tokenIndexFrom) {
				_x = x;
			} else if (i != tokenIndexTo) {
				_x = xp[i];
			} else {
				continue;
			}
			s = s.add(_x);
			c = c.mul(d).div(_x.mul(numTokens));
			// If we were to protect the division loss we would have to keep the denominator separate
			// and divide at the end. However this leads to overflow with large numTokens or/and D.
			// c = c * D * D * D * ... overflow!
		}
		c = c.mul(d).mul(AmplificationUtils.A_PRECISION).div(nA.mul(numTokens));
		uint256 b = s.add(d.mul(AmplificationUtils.A_PRECISION).div(nA));
		uint256 yPrev;
		uint256 y = d;

		// iterative approximation
		for (uint256 i = 0; i < MAX_LOOP_LIMIT; i++) {
			yPrev = y;
			y = y.mul(y).add(c).div(y.mul(2).add(b).sub(d));
			if (y.within1(yPrev)) {
				return y;
			}
		}
		revert("Approximation did not converge");
	}

	/**
	 * @notice Externally calculates a swap between two tokens.
	 * @param self Swap struct to read from
	 * @param tokenIndexFrom the token to sell
	 * @param tokenIndexTo the token to buy
	 * @param dx the number of tokens to sell. If the token charges a fee on transfers,
	 * use the amount that gets transferred after the fee.
	 * @return dy the number of tokens the user will get
	 */
	function calculateSwap(
		Swap storage self,
		uint8 tokenIndexFrom,
		uint8 tokenIndexTo,
		uint256 dx
	) external view returns (uint256 dy) {
		dy = _calculateSwap(
			self,
			tokenIndexFrom,
			tokenIndexTo,
			dx,
			self.balances
		);
	}

	/**
	 * @notice Internally calculates a swap between two tokens.
	 *
	 * @dev The caller is expected to transfer the actual amounts (dx and dy)
	 * using the token contracts.
	 *
	 * @param self Swap struct to read from
	 * @param tokenIndexFrom the token to sell
	 * @param tokenIndexTo the token to buy
	 * @param dx the number of tokens to sell. If the token charges a fee on transfers,
	 * use the amount that gets transferred after the fee.
	 * @return dy the number of tokens the user will get
	 */
	function _calculateSwap(
		Swap storage self,
		uint8 tokenIndexFrom,
		uint8 tokenIndexTo,
		uint256 dx,
		uint256[] memory balances
	) internal view returns (uint256 dy) {
		uint256[] memory multipliers = self.tokenPrecisionMultipliers;
		uint256[] memory xp = _xp(balances, multipliers);
		require(
			tokenIndexFrom < xp.length && tokenIndexTo < xp.length,
			"Token index out of range"
		);
		uint256 x = dx.mul(multipliers[tokenIndexFrom]).add(xp[tokenIndexFrom]);
		uint256 y = getY(
			_getAPrecise(self),
			tokenIndexFrom,
			tokenIndexTo,
			x,
			xp
		);
		dy = xp[tokenIndexTo].sub(y).sub(1);
		dy = dy.div(multipliers[tokenIndexTo]);
	}

	/**
	 * @notice A simple method to calculate amount of each underlying
	 * tokens that is returned upon burning given amount of
	 * LP tokens
	 *
	 * @param amount the amount of LP tokens that would to be burned on
	 * withdrawal
	 * @return array of amounts of tokens user will receive
	 */
	function calculateRemoveLiquidity(
		Swap storage self,
		uint256 amount
	) external view returns (uint256[] memory) {
		return
			_calculateRemoveLiquidity(
				self.balances,
				amount,
				self.virtualLpBalance
			);
	}

	function _calculateRemoveLiquidity(
		uint256[] memory balances,
		uint256 amount,
		uint256 totalSupply
	) internal pure returns (uint256[] memory) {
		require(amount <= totalSupply, "Cannot exceed total supply");

		uint256[] memory amounts = new uint256[](balances.length);

		for (uint256 i = 0; i < balances.length; i++) {
			// we need to multiply by 1e18 to get the correct precision
			amounts[i] = balances[i].mul(amount).div(totalSupply);
		}
		return amounts;
	}

	/**
	 * @notice A simple method to calculate prices from deposits or
	 * withdrawals, excluding fees but including slippage. This is
	 * helpful as an input into the various "min" parameters on calls
	 * to fight front-running
	 *
	 * @dev This shouldn't be used outside frontends for user estimates.
	 *
	 * @param self Swap struct to read from
	 * @param amounts an array of token amounts to deposit or withdrawal,
	 * corresponding to pooledTokens. The amount should be in each
	 * pooled token's native precision. If a token charges a fee on transfers,
	 * use the amount that gets transferred after the fee.
	 * @param deposit whether this is a deposit or a withdrawal
	 * @return if deposit was true, total amount of lp token that will be minted and if
	 * deposit was false, total amount of lp token that will be burned
	 */
	function calculateTokenAmount(
		Swap storage self,
		uint256[] calldata amounts,
		bool deposit
	) external view returns (uint256) {
		uint256 a = _getAPrecise(self);
		uint256[] memory balances = self.balances;
		uint256[] memory multipliers = self.tokenPrecisionMultipliers;

		uint256 d0 = getD(_xp(balances, multipliers), a);
		for (uint256 i = 0; i < balances.length; i++) {
			if (deposit) {
				balances[i] = balances[i].add(amounts[i]);
			} else {
				balances[i] = balances[i].sub(
					amounts[i],
					"Cannot withdraw more than available"
				);
			}
		}
		uint256 d1 = getD(_xp(balances, multipliers), a);
		uint256 totalSupply = self.virtualLpBalance;

		if (deposit) {
			return d1.sub(d0).mul(totalSupply).div(d0);
		} else {
			return d0.sub(d1).mul(totalSupply).div(d0);
		}
	}

	/**
	 * @notice return accumulated returns of the token deposited on aave
	 * @param self Swap struct to read from
	 * @return admin balance in the token's precision
	 */
	function getReturnsBalance(
		Swap storage self,
		uint256 index
	) external view returns (uint256) {
		require(index < self.pooledTokens.length, "Token index out of range");
		return
			self.pooledTokens[index].balanceOf(address(this)).sub(
				self.balances[index]
			);
	}

	/*** STATE MODIFYING FUNCTIONS ***/

	/**
	 * @notice swap two tokens in the pool
	 * @param self Swap struct to read from and write to
	 * @param tokenIndexFrom the token the user wants to sell
	 * @param tokenIndexTo the token the user wants to buy
	 * @param dx the amount of tokens the user wants to sell
	 * @param minDy the min amount the user would like to receive, or revert.
	 * @return amount of token user received on swap
	 */
	function _swap(
		Swap storage self,
		uint8 tokenIndexFrom,
		uint8 tokenIndexTo,
		uint256 dx,
		uint256 minDy
	) internal returns (uint256) {
		uint256 dy;
		uint256[] memory balances = self.balances;
		dy = _calculateSwap(self, tokenIndexFrom, tokenIndexTo, dx, balances);
		require(dy >= minDy, "Swap didn't result in min tokens");
		self.balances[tokenIndexFrom] = balances[tokenIndexFrom].add(dx);
		self.balances[tokenIndexTo] = balances[tokenIndexTo].sub(dy);

		emit TokenSwap(msg.sender, dx, dy, tokenIndexFrom, tokenIndexTo);

		return dy;
	}

	/**
	 * @notice Add liquidity to the pool
	 * @param self Swap struct to read from and write to
	 * @param amounts the amounts of each token to add, in their native precision
	 * @param _mintToMint the min amount of LP token the user accepts to mint, or revert.
	 * should mint, otherwise revert. Handy for front-running mitigation
	 * allowed addresses. If the pool is not in the guarded launch phase, this parameter will be ignored.
	 * @return amount of LP token user received
	 */
	function _addLiquidity(
		Swap storage self,
		uint256[] memory amounts,
		uint256 _mintToMint
	) internal returns (uint256) {
		IERC20[] memory pooledTokens = self.pooledTokens;
		require(
			amounts.length == pooledTokens.length,
			"Amounts must match pooled tokens"
		);

		// current state
		ManageLiquidityInfo memory v = ManageLiquidityInfo(
			0,
			0,
			0,
			_getAPrecise(self),
			self.virtualLpBalance,
			self.balances,
			self.tokenPrecisionMultipliers
		);

		if (v.totalSupply != 0) {
			v.d0 = getD(_xp(v.balances, v.multipliers), v.preciseA);
		}

		uint256[] memory newBalances = new uint256[](pooledTokens.length);

		for (uint256 i = 0; i < pooledTokens.length; i++) {
			require(
				v.totalSupply != 0 || amounts[i] > 0,
				"Must supply all tokens in pool"
			);

			newBalances[i] = v.balances[i].add(amounts[i]);
			// NOTE: this is not needed, as the balances are checked in the parent
			// require(pooledTokens[i].balanceOf(address(this)) >= newBalances[i], "incorrect balances");
		}

		// invariant after change
		v.d1 = getD(_xp(newBalances, v.multipliers), v.preciseA);
		require(v.d1 > v.d0, "D should increase");

		// updated to calculate the user's LP tokens
		v.d2 = v.d1;

		// update the balances
		self.balances = newBalances;

		uint256 toMint;
		if (v.totalSupply == 0) {
			toMint = v.d1;
		} else {
			toMint = v.d2.sub(v.d0).mul(v.totalSupply).div(v.d0);
		}
		require(toMint >= _mintToMint, "!minToMint");

		// mint the user's LP tokens
		self.virtualLpBalance += toMint;

		emit AddLiquidity(msg.sender, amounts, v.d1, v.totalSupply.add(toMint));

		return (toMint);
	}

	/**
	 * @notice Burn LP tokens to remove liquidity from the pool.
	 * @dev Liquidity can always be removed, even when the pool is paused.
	 * @param self Swap struct to read from and write to
	 * @param amount the amount of LP tokens to burn
	 * @param minAmounts the minimum amounts of each token in the pool
	 * acceptable for this burn. Useful as a front-running mitigation
	 * @return amounts of tokens the user received
	 */
	function _removeLiquidity(
		Swap storage self,
		uint256 amount,
		uint256[] memory minAmounts
	) internal returns (uint256[] memory) {
		IERC20[] memory pooledTokens = self.pooledTokens;
		require(amount <= self.virtualLpBalance, ">LP.balanceOf");
		require(
			minAmounts.length == pooledTokens.length,
			"minAmounts must match poolTokens"
		);

		uint256[] memory balances = self.balances;

		uint256 totalSupply = self.virtualLpBalance;

		uint256[] memory amounts = _calculateRemoveLiquidity(
			balances,
			amount,
			totalSupply
		);

		for (uint256 i = 0; i < amounts.length; i++) {
			require(amounts[i] >= minAmounts[i], "amounts[i] < minAmounts[i]");
			self.balances[i] = balances[i].sub(amounts[i]);
		}

		self.virtualLpBalance -= amount;

		emit RemoveLiquidity(msg.sender, amounts, totalSupply.sub(amount));

		return amounts;
	}
}
