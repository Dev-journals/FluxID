import { Networks } from '@stellar/stellar-sdk';

export type NetworkType = 'mainnet' | 'testnet';

export interface StellarConfig {
  horizonUrl: string;
  rpcUrl: string;
  networkPassphrase: string;
  contractId?: string;
}

export const STELLAR_CONFIGS: Record<NetworkType, StellarConfig> = {
  mainnet: {
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    networkPassphrase: Networks.PUBLIC,
    contractId: process.env.MAINNET_CONTRACT_ID,
  },
  testnet: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    contractId: process.env.TESTNET_CONTRACT_ID,
  },
};

export function getStellarConfig(network: NetworkType = 'testnet'): StellarConfig {
  return STELLAR_CONFIGS[network];
}
