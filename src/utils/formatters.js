// src/utils/formatters.js
import { ethers } from 'ethers';

/**
 * Format address to display form (0x1234...5678)
 * @param {string} address - The full address
 * @param {number} prefixLength - Number of prefix characters to show
 * @param {number} suffixLength - Number of suffix characters to show 
 * @returns {string} - Formatted address
 */
export const formatAddress = (address, prefixLength = 6, suffixLength = 4) => {
  if (!address) return '';
  return `${address.slice(0, prefixLength)}...${address.slice(-suffixLength)}`;
};

/**
 * Format token amount with proper decimals
 * @param {string|number|ethers.BigNumber} amount - Token amount
 * @param {number} decimals - Number of decimals
 * @returns {string} - Formatted amount
 */
export const formatTokenAmount = (amount, decimals = 18) => {
  if (!amount) return '0';
  return ethers.utils.formatUnits(amount, decimals);
};

/**
 * Parse token amount to wei
 * @param {string|number} amount - Token amount
 * @param {number} decimals - Number of decimals
 * @returns {ethers.BigNumber} - Amount in wei
 */
export const parseTokenAmount = (amount, decimals = 18) => {
  if (!amount) return ethers.BigNumber.from(0);
  return ethers.utils.parseUnits(amount.toString(), decimals);
};

/**
 * Get transaction status color class
 * @param {string} status - Transaction status
 * @returns {string} - Tailwind color class
 */
export const getStatusColorClass = (status) => {
  switch (status) {
    case 'pending': return 'text-yellow-600';
    case 'confirmed': return 'text-green-600';
    case 'failed': return 'text-red-600';
    default: return 'text-gray-500';
  }
};

/**
 * Get transaction type color class
 * @param {string} type - Transaction type
 * @returns {string} - Tailwind color class
 */
export const getTypeColorClass = (type) => {
  switch (type) {
    case 'Click': return 'text-green-600';
    case 'Redeem': return 'text-blue-600';
    case 'Fund': return 'text-purple-600';
    default: return 'text-gray-600';
  }
};