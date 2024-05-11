// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

contract Events {
  // Stargate
  // Bridge
  // event SendMsg(uint8 msgType, uint64 nonce);
  // LPStaking
  event Deposit(address indexed user, uint256 indexed pid, uint256 amount);
  event Withdraw(address indexed user, uint256 indexed pid, uint256 amount);
  event EmergencyWithdraw(
    address indexed user,
    uint256 indexed pid,
    uint256 amount
  );
  // Pool
  event Mint(
    address to,
    uint256 amountLP,
    uint256 amountSD,
    uint256 mintFeeAmountSD
  );
  event Burn(address from, uint256 amountLP, uint256 amountSD);
  event RedeemLocalCallback(
    address _to,
    uint256 _amountSD,
    uint256 _amountToMintSD
  );
  event Swap(
    uint16 chainId,
    uint256 dstPoolId,
    address from,
    uint256 amountSD,
    uint256 eqReward,
    uint256 eqFee,
    uint256 protocolFee,
    uint256 lpFee
  );
  event SendCredits(
    uint16 dstChainId,
    uint256 dstPoolId,
    uint256 credits,
    uint256 idealBalance
  );
  event RedeemRemote(
    uint16 chainId,
    uint256 dstPoolId,
    address from,
    uint256 amountLP,
    uint256 amountSD
  );
  event RedeemLocal(
    address from,
    uint256 amountLP,
    uint256 amountSD,
    uint16 chainId,
    uint256 dstPoolId,
    bytes to
  );
  event InstantRedeemLocal(
    address from,
    uint256 amountLP,
    uint256 amountSD,
    address to
  );
  event CreditChainPath(
    uint16 chainId,
    uint256 srcPoolId,
    uint256 amountSD,
    uint256 idealBalance
  );
  event SwapRemote(
    address to,
    uint256 amountSD,
    uint256 protocolFee,
    uint256 dstFee
  );
  event WithdrawRemote(
    uint16 srcChainId,
    uint256 srcPoolId,
    uint256 swapAmount,
    uint256 mintAmount
  );
  event ChainPathUpdate(uint16 dstChainId, uint256 dstPoolId, uint256 weight);
  event FeesUpdated(uint256 mintFeeBP);
  event FeeLibraryUpdated(address feeLibraryAddr);
  event StopSwapUpdated(bool swapStop);
  event WithdrawProtocolFeeBalance(address to, uint256 amountSD);
  event WithdrawMintFeeBalance(address to, uint256 amountSD);
  event DeltaParamUpdated(
    bool batched,
    uint256 swapDeltaBP,
    uint256 lpDeltaBP,
    bool defaultSwapMode,
    bool defaultLPMode
  );

  // Layer Zero

  //Endpoint
  event NewLibraryVersionAdded(uint16 version);
  event DefaultSendVersionSet(uint16 version);
  event DefaultReceiveVersionSet(uint16 version);
  event UaSendVersionSet(address ua, uint16 version);
  event UaReceiveVersionSet(address ua, uint16 version);
  event UaForceResumeReceive(uint16 chainId, bytes srcAddress);
  // payload events
  event PayloadCleared(
    uint16 srcChainId,
    bytes srcAddress,
    uint64 nonce,
    address dstAddress
  );
  event PayloadStored(
    uint16 srcChainId,
    bytes srcAddress,
    address dstAddress,
    uint64 nonce,
    bytes payload,
    bytes reason
  );

  //Relayer
  event WithdrawTokens(address token, address to, uint256 amount);
  event Withdraw(address to, uint256 amount);
  event ApproveAddress(address addr, bool approved);

  // Treasury
  event NativeBP(uint256 bp);
  event ZroFee(uint256 zroFee);
  event FeeEnabled(bool feeEnabled);
  event ZroEnabled(bool zroEnabled);

  // UL Node
  event AppConfigUpdated(
    address userApplication,
    uint256 configType,
    bytes newConfig
  );
  event AddInboundProofLibraryForChain(uint16 chainId, address lib);
  event EnableSupportedOutboundProof(uint16 chainId, uint16 proofType);
  event HashReceived(
    uint16 srcChainId,
    address oracle,
    uint256 confirmations,
    bytes32 blockhash
  );
  event Packet(uint16 chainId, bytes payload);
  event RelayerParams(
    uint16 chainId,
    uint64 nonce,
    uint16 outboundProofType,
    bytes adapterParams
  );
  event SetChainAddressSize(uint16 chainId, uint256 size);
  event SetDefaultConfigForChainId(
    uint16 chainId,
    uint16 inboundProofLib,
    uint64 inboundBlockConfirm,
    address relayer,
    uint16 outboundProofType,
    uint16 outboundBlockConfirm,
    address oracle
  );
  event SetDefaultAdapterParamsForChainId(
    uint16 chainId,
    uint16 proofType,
    bytes adapterParams
  );
  event SetLayerZeroToken(address tokenAddress);
  event SetRelayerFeeContract(address relayerFeeContract);
  event SetRemoteUln(uint16 chainId, bytes32 uln);
  event SetTreasury(address treasuryAddress);
  event WithdrawZRO(address _msgSender, address _to, uint256 _amount);
  event WithdrawNative(
    uint8 _type,
    address _owner,
    address _msgSender,
    address _to,
    uint256 _amount
  );

  // UniswapV2Router
  event Mint(address indexed sender, uint256 amount0, uint256 amount1);
  event Burn(
    address indexed sender,
    uint256 amount0,
    uint256 amount1,
    address indexed to
  );
  event Swap(
    address indexed sender,
    uint256 amount0In,
    uint256 amount1In,
    uint256 amount0Out,
    uint256 amount1Out,
    address indexed to
  );
  event Sync(uint112 reserve0, uint112 reserve1);
  event Approval(address indexed owner, address indexed spender, uint256 value);
  event Transfer(address indexed from, address indexed to, uint256 value);
}
