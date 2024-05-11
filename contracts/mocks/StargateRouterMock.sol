// SPDX-License-Identifier: GPL-3.0-or-later


pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../external/solidity-examples/contracts/interfaces/IStargateReceiver.sol";
import "../external/solidity-examples/contracts/interfaces/IStargateRouter.sol";

contract StargateRouterBasicMock {
	struct lzTxObj {
		uint256 dstGasForCall;
		uint256 dstNativeAmount;
		bytes dstNativeAddr;
	}
	address public usdc;
	address public stg;
	uint256 public dstPoolId;
	uint256 public srcPoolId;
	uint16 public remoteLzChainId;
	uint16 public homeLzChainId;
	bool public allowBridgeFailure;

	uint16 homeChainId = 101;

	constructor(
		address _usdc,
		address _stg,
		uint256 _dstPoolId,
		uint16 _remoteLzChainId,
		uint16 _homeLzChainId
	) {
		usdc = _usdc;
		stg = _stg;
		_dstPoolId = dstPoolId;
		remoteLzChainId = _remoteLzChainId;
		homeLzChainId = _homeLzChainId;
	}

	function quoteLayerZeroFee(
		uint16 _dstChainId,
		uint8 _functionType,
		bytes calldata _toAddress,
		bytes calldata _transferAndCallPayload,
		IStargateRouter.lzTxObj memory _lzTxParams
	) public view returns (uint256, uint256) {
		_lzTxParams.dstGasForCall += 200_000;

		if (_dstChainId == homeChainId) {
			_dstChainId = homeChainId;
		}

		return
			IStargateRouter(stg).quoteLayerZeroFee(
				_dstChainId,
				_functionType,
				_toAddress,
				_transferAndCallPayload,
				_lzTxParams
			);
	}

	// give 20 bytes, return the decoded address
	function packedBytesToAddr(
		bytes calldata _b
	) public pure returns (address) {
		address addr;
		assembly {
			let ptr := mload(0x40)
			calldatacopy(ptr, sub(_b.offset, 2), add(_b.length, 2))
			addr := mload(sub(ptr, 10))
		}
		return addr;
	}

	function seeBalance() external view returns (uint256) {
		return ERC20(usdc).balanceOf(address(this));
	}

	// solhint-disable-next-line no-unused-vars
	function swap(
		uint16 _dstChainId,
		uint256 _srcPoolId,
		uint256 _dstPoolId,
		address payable _refundAddress,
		uint256 _amountLD,
		uint256 _minAmountLD,
		IStargateRouter.lzTxObj memory _lzTxParams,
		bytes calldata _to,
		bytes calldata _payload
	) external payable {
		ERC20(usdc).transferFrom(msg.sender, address(this), _amountLD);
		ERC20(usdc).transfer(bytesToAddress(_to), (_amountLD * 998) / 1000);
		uint256 amountAfterFees = (_amountLD * 998) / 1000;
		if (amountAfterFees < _minAmountLD) {
			revert("Stargate: slippage too high");
		}

		{
			(uint256 fee, ) = quoteLayerZeroFee(
				_dstChainId,
				1,
				_to,
				_payload,
				_lzTxParams
			);
			require(msg.value >= fee, "Stargate: insufficient native fee");
		}
		if(_lzTxParams.dstNativeAmount != 0) {
			payable(bytesToAddress(_lzTxParams.dstNativeAddr)).transfer(
				_lzTxParams.dstNativeAmount
			);
		}

		try
			IStargateReceiver(bytesToAddress(_to)).sgReceive{
				gas: _lzTxParams.dstGasForCall
			}(
				generateOriginChainId(_dstChainId),
				abi.encodePacked(msg.sender),
				block.number,
				usdc,
				amountAfterFees,
				_payload
			)
		{
		} catch {
			// if (_lzTxParams.dstGasForCall != 0)
		}

		// Simulate Refund

		_refundAddress.transfer(address(this).balance);

		// useless but disables warning
		_dstChainId = 0;
		_minAmountLD = 0;
	}

	function setAllowBridgeFailure(bool _allowBridgeFailure) external {
		allowBridgeFailure = _allowBridgeFailure;
	}

	function generateOriginChainId(
		uint16 _dstChainId
	) internal view returns (uint16) {
		if (_dstChainId == homeLzChainId) {
			return remoteLzChainId;
		} else return homeLzChainId;
	}

	receive() external payable {}

	function bytesToAddress(
		bytes memory bys
	) private pure returns (address addr) {
		assembly {
			addr := mload(add(bys, 20))
		}
	}
}
