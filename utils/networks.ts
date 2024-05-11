import "dotenv/config";
import { ethers } from "ethers";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";

async function getDeployerWallet(provider: JsonRpcProvider): Promise<Wallet> {
  return new ethers.Wallet(process.env.DEPLOYER_PK as string, provider);
}

function generateWalletsFromMnemonic(mnemonic: string, numWallets: number) {
  const wallets = [];

  // Generate the wallet using the mnemonic phrase
  const seed = ethers.utils.mnemonicToSeed(mnemonic);
  const rootNode = ethers.utils.HDNode.fromSeed(seed);

  // Generate multiple wallets from the root node
  for (let i = 0; i < numWallets; i++) {
    const childNode = rootNode.derivePath(`m/44'/60'/0'/0/${i}`);
    const wallet = new ethers.Wallet(childNode.privateKey);
    wallets.push(wallet);
  }

  return wallets;
}

export { getDeployerWallet, generateWalletsFromMnemonic };
