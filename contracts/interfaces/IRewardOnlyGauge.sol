// SPDX-License-Identifier: MIT

// pragma solidity ^0.8.0;

// interface IRewardOnlyGauge {
//     event Deposit(address indexed provider, uint256 value);

//     event Withdraw(address indexed provider, uint256 value);

//     event Transfer(address indexed _from, address indexed _to, uint256 value);

//     event Approval(
//         address indexed _owner,
//         address indexed _spender,
//         uint256 _value
//     );

//     function decimals() external view returns (uint256);

//     function version() external view returns (string);

//     function reward_contract() external view returns (address);

//     function last_claim() external view returns (uint256);

//     function claimed_reward(address _addr, address _token)
//         external
//         view
//         returns (uint256);

//     function claimable_reward(address _addr, address _token)
//         external
//         view
//         returns (uint256);

//     // function reward_data(address _token) external view returns (tuple);

//     function claimable_reward_write(address _addr, address _token)
//         external
//         returns (uint256);

//     function set_rewards_receiver(address _receiver) external;

//     function claim_rewards() external;

//     function claim_rewards(address _addr) external;

//     function claim_rewards(address _addr, address _receiver) external;

//     function deposit(uint256 _value) external;

//     function deposit(uint256 _value, address _addr) external;

//     function deposit(
//         uint256 _value,
//         address _addr,
//         bool _claim_rewards
//     ) external;

//     function withdraw(uint256 _value) external;

//     function withdraw(uint256 _value, bool _claim_rewards) external;

//     function transfer(address _to, uint256 _value) external returns (bool);

//     function transferFrom(
//         address _from,
//         address _to,
//         uint256 _value
//     ) external returns (bool);

//     function allowance(address owner, address spender)
//         external
//         view
//         returns (uint256);

//     function approve(address _spender, uint256 _value) external returns (bool);

//     function permit(
//         address _owner,
//         address _spender,
//         uint256 _value,
//         uint256 _deadline,
//         uint8 _v,
//         bytes32 _r,
//         bytes32 _s
//     ) external returns (bool);

//     function increaseAllowance(address _spender, uint256 _added_value)
//         external
//         returns (bool);

//     function decreaseAllowance(address _spender, uint256 _subtracted_value)
//         external
//         returns (bool);

//     function set_rewards(
//         address _reward_contract,
//         bytes32 _claim_sig,
//         address[8] _reward_tokens
//     ) external;

//     function initialize(
//         address _lp_token,
//         address _reward_contract,
//         bytes32 _claim_sig
//     ) external;

//     function lp_token() external view returns (address);

//     function balanceOf(address arg0) external view returns (uint256);

//     function totalSupply() external view returns (uint256);

//     function name() external view returns (string);

//     function symbol() external view returns (string);

//     function DOMAIN_SEPARATOR() external view returns (bytes32);

//     function nonces(address arg0) external view returns (uint256);

//     function reward_tokens(uint256 arg0) external view returns (address);

//     function reward_balances(address arg0) external view returns (uint256);

//     function rewards_receiver(address arg0) external view returns (address);

//     function claim_sig() external view returns (bytes);

//     function reward_integral(address arg0) external view returns (uint256);

//     function reward_integral_for(address arg0, address arg1)
//         external
//         view
//         returns (uint256);
// }
