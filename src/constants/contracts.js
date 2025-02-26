// src/constants/contracts.js
export const COOKIE_TOKEN_ADDRESS = "0x8e378075aF71d3232be905433d612C96E38726DB";
export const COOKIE_CLICKER_ADDRESS = "0xC133d1082457587929951bA9a20bc529577B7a0e";

export const COOKIE_TOKEN_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ];
  
export const COOKIE_CLICKER_ABI = [
    // Player interactions
    "function click() external",
    // Note: batchClick has been removed
    "function redeem(uint256 scoreToRedeem) external",
    
    // View functions
    "function getScore(address player) view returns (uint256)",
    "function getRedeemableTokens(address player) view returns (uint256)",
    "function getContractBalance() view returns (uint256)",
    "function clicksPerToken() view returns (uint256)",
    "function players(address) view returns (uint256 score, uint256 lastClickTime)",
    
    // Contract funding
    "function fundContract(uint256 amount) external",
    
    // Events
    "event Click(address indexed player, uint256 newScore)",
    "event Redeem(address indexed player, uint256 score, uint256 tokens)",
    "event ContractFunded(address indexed funder, uint256 amount)"
  ];