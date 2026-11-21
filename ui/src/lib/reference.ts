import type { Address } from 'viem';

/** Published Sepolia deployment used by this testnet experiment. */
export const SEPOLIA_REFERENCE = {
  chainId: 11155111,
  property: '0xC19de6D6753919C69EB6105Df2c2Bcb43C38934C' as Address,
  stablecoin: '0x89676d646726BeF1BBb96988A3E28412E73BC62f' as Address,
  vault: '0xE209c3401cc1dFAbFD4AbBD7e43e167Fbd1aB3ee' as Address,
  rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
};
