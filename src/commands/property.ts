/**
 * Learning wallet — never use a seed phrase that controls real money.
 *
 * Commands for the property-share lesson in `property-token/`.
 *
 *   deploy           create the play dollar and the share token from your keystore
 *   info             free reads: the label, your shares, what you can claim
 *   allow / freeze   the classroom allowlist (a stand-in for a KYC list)
 *   transfer         move shares. The recipient must already be allowed.
 *   deposit-eth      manager deposits ETH rent. The amount is the transaction value.
 *   approve-stable   let the property contract pull mock dollars
 *   deposit-stable   manager deposits that approved amount as rent
 *   claimable        free read of what one address could take right now
 *   claim-eth        take the ETH rent your shares have earned
 *   claim-stable     take the mock-dollar rent your shares have earned
 *
 * The forge script in `property-token/script/Deploy.s.sol` deploys the same
 * contracts from Anvil's published key. Use that path with `cast` if you are
 * following the README walkthrough. Use these commands when you want the
 * transaction signed by the keystore from `npm run wallet -- create`, so a
 * private key never has to sit in the shell command.
 *
 * These shares are a classroom model of a security. There is no building.
 * Do not sell them, and do not tell anyone they are buying one.
 */
import { formatEther, formatUnits } from 'viem';
import { parseUserAddress } from '../address.js';
import { parseEthAmount, parseMockDollars, parseShareCount } from '../amounts.js';
import { printRealFundsWarning } from '../banner.js';
import { loadConfig } from '../config.js';
import type { Flags } from '../flags.js';
import { confirmYes } from '../prompt.js';
import { unlockAccount } from '../unlock.js';
import { makePublicClient } from '../client.js';
import {
  PLAY_DOLLARS_BASE_UNITS,
  PLACEHOLDER_DOCUMENT_HASH,
  encodeApproveStable,
  encodeClaimEth,
  encodeClaimStable,
  encodeDepositEth,
  encodeDepositStable,
  encodeMintStable,
  encodePropertyDeploy,
  encodeSetAllowed,
  encodeStablecoinDeploy,
  encodeTransferShares,
  mockStablecoinAbi,
  prepareCall,
  prepareDeploy,
  propertyShareAbi,
  readPropertyOverview,
  resolvePropertyAddress,
  savePropertyRecord,
  type PreparedCall,
} from '../property.js';

const USAGE = [
  'property needs a subcommand.',
  'Examples:',
  '  npm run wallet -- property deploy',
  '  npm run wallet -- property info',
  '  npm run wallet -- property allow --address 0x...',
  '  npm run wallet -- property freeze --address 0x...',
  '  npm run wallet -- property transfer --to 0x... --shares 250000',
  '  npm run wallet -- property deposit-eth --eth 1',
  '  npm run wallet -- property approve-stable --amount 1000',
  '  npm run wallet -- property deposit-stable --amount 1000',
  '  npm run wallet -- property claimable',
  '  npm run wallet -- property claim-eth',
  '  npm run wallet -- property claim-stable',
  '',
  'The cast walkthrough, which uses Anvil\'s published key, is in property-token/README.md.',
].join('\n');

export async function propertyCommand(sub: string | undefined, flags: Flags): Promise<void> {
  if (sub === 'deploy') return deploy(flags);
  if (sub === 'info') return info(flags);
  if (sub === 'allow') return allow(flags, true);
  if (sub === 'freeze') return allow(flags, false);
  if (sub === 'transfer') return transfer(flags);
  if (sub === 'deposit-eth') return depositEth(flags);
  if (sub === 'approve-stable') return approveStable(flags);
  if (sub === 'deposit-stable') return depositStable(flags);
  if (sub === 'claimable') return claimable(flags);
  if (sub === 'claim-eth') return claimEth(flags);
  if (sub === 'claim-stable') return claimStable(flags);
  throw new Error(USAGE);
}

async function deploy(flags: Flags): Promise<void> {
  printRealFundsWarning();
  console.log('These shares are a classroom model. There is no building, no LLC, and no offering.');
  console.log('The deploy script refuses mainnet. This wallet already refuses every chain except Anvil and Sepolia.');
  console.log('');

  const config = loadConfig(process.env, flags.chain);
  const unlocked = await unlockAccount(flags.index);

  const stableData = encodeStablecoinDeploy(unlocked.address);
  const stable = await prepareDeploy({
    config,
    account: unlocked.account,
    path: unlocked.path,
    data: stableData,
    action: 'Deploy MockStablecoin, the play dollar for the rent lesson',
    note: 'The deployer becomes the only address that can mint. A real dollar does not work this way. This token is a prop.',
  });
  console.log(stable.preview);
  await confirmYes(flags.yes);
  const stableSent = await stable.send();
  if (!stableSent.contractAddress) {
    throw new Error(`MockStablecoin deployment did not leave an address. Hash: ${stableSent.hash}`);
  }
  console.log(`MockStablecoin deployed at ${stableSent.contractAddress}`);
  console.log(`Transaction hash: ${stableSent.hash}`);
  console.log('');

  const propertyData = encodePropertyDeploy({
    stablecoin: stableSent.contractAddress,
    admin: unlocked.address,
  });
  const property = await prepareDeploy({
    config,
    account: unlocked.account,
    path: unlocked.path,
    data: propertyData,
    action: 'Deploy PropertyShare and mint 1,000,000 shares to you',
    note: [
      'You are the admin, the manager, and the first shareholder. Those are three different facts that happen to be the same address.',
      `Document hash: ${PLACEHOLDER_DOCUMENT_HASH}`,
      'That hash is keccak256 of a sentence that says there is no deed. It is not a deed.',
    ].join('\n'),
  });
  console.log(property.preview);
  await confirmYes(flags.yes);
  const propertySent = await property.send();
  if (!propertySent.contractAddress) {
    throw new Error(`PropertyShare deployment did not leave an address. Hash: ${propertySent.hash}`);
  }
  const filePath = savePropertyRecord({
    property: propertySent.contractAddress,
    stablecoin: stableSent.contractAddress,
    chainId: config.chain.id,
    deployedAt: new Date().toISOString(),
  });
  console.log(`PropertyShare deployed at ${propertySent.contractAddress}`);
  console.log(`Transaction hash: ${propertySent.hash}`);
  console.log(`Saved both addresses to ${filePath}`);
  console.log('Stopping Anvil forgets the contracts. The keystore remains. Deploy again after a restart.');
  console.log('');

  const mintData = encodeMintStable(unlocked.address, PLAY_DOLLARS_BASE_UNITS);
  const mint = await prepareCall({
    config,
    account: unlocked.account,
    path: unlocked.path,
    to: stableSent.contractAddress,
    data: mintData,
    valueWei: 0n,
    action: 'Mint 1,000,000 mock dollars to yourself, so you can practice a stablecoin rent deposit',
    note: 'Value is 0. The new tokens are created inside the call. 1,000,000 dollars with 6 decimals is 1,000,000,000,000 base units.',
    simulate: () =>
      makePublicClient(config).simulateContract({
        address: stableSent.contractAddress!,
        abi: mockStablecoinAbi,
        functionName: 'mint',
        args: [unlocked.address, PLAY_DOLLARS_BASE_UNITS],
        account: unlocked.account,
      }),
  });
  console.log(mint.preview);
  await confirmYes(flags.yes);
  const minted = await mint.send();
  console.log(`Minted. Transaction hash: ${minted.hash}`);
  console.log('Try: npm run wallet -- property info');
}

async function info(flags: Flags): Promise<void> {
  const snapshot = await loadOverview(flags);
  printOverview(snapshot);
}

async function claimable(flags: Flags): Promise<void> {
  const snapshot = await loadOverview(flags);
  console.log(`Property: ${snapshot.address} (from ${snapshot.source})`);
  console.log(`Holder:   ${snapshot.you}`);
  console.log(`Shares:   ${formatShares(snapshot.yourShares, snapshot.totalSupply)}`);
  console.log(`ETH you can claim:    ${formatEther(snapshot.claimableEthWei)} ETH`);
  console.log(`                      ${snapshot.claimableEthWei.toString()} wei`);
  console.log(`Dollars you can claim: ${formatUnits(snapshot.claimableStableBase, 6)} ${snapshot.stableSymbol}`);
  console.log(`                      ${snapshot.claimableStableBase.toString()} base units (6 decimals)`);
  console.log('');
  console.log('This is a free read. Claiming is a separate transaction: property claim-eth or property claim-stable.');
  console.log('A balance of zero shares can still have a claim, if you earned the rent and then sold the shares.');
}

async function allow(flags: Flags, approved: boolean): Promise<void> {
  if (!flags.address) {
    throw new Error(
      `property ${approved ? 'allow' : 'freeze'} needs --address 0x... of the account whose permission is changing.`,
    );
  }
  const who = parseUserAddress(flags.address);
  const data = encodeSetAllowed(who, approved);
  await broadcast(flags, {
    data,
    valueWei: 0n,
    action: approved
      ? `Allow ${who} to hold shares`
      : `Freeze ${who}. Shares they already hold cannot move until you allow them again.`,
    note: approved
      ? 'This is the classroom stand-in for a KYC allowlist. The contract does not check a passport. It checks this boolean.'
      : 'Freezing yourself while you still hold shares locks those shares. There is no forced-transfer function in this lesson.',
    simulate: (address, account, config) =>
      makePublicClient(config).simulateContract({
        address,
        abi: propertyShareAbi,
        functionName: 'setAllowed',
        args: [who, approved],
        account,
      }),
  });
}

async function transfer(flags: Flags): Promise<void> {
  if (!flags.to || !flags.shares) {
    throw new Error('property transfer needs --to 0x... and --shares 250000');
  }
  const to = parseUserAddress(flags.to);
  const shares = parseShareCount(flags.shares);
  const data = encodeTransferShares(to, shares);
  await broadcast(flags, {
    data,
    valueWei: 0n,
    action: `Transfer ${shares.toString()} shares to ${to}`,
    note: 'Both of you must be on the allowlist. Rent already earned stays with the seller. The buyer starts earning from the next deposit.',
    simulate: (address, account, config) =>
      makePublicClient(config).simulateContract({
        address,
        abi: propertyShareAbi,
        functionName: 'transfer',
        args: [to, shares],
        account,
      }),
  });
}

async function depositEth(flags: Flags): Promise<void> {
  if (!flags.eth) {
    throw new Error('property deposit-eth needs --eth.\nExample: npm run wallet -- property deposit-eth --eth 1');
  }
  const amountWei = parseEthAmount(flags.eth);
  const data = encodeDepositEth();
  await broadcast(flags, {
    data,
    valueWei: amountWei,
    action: 'Deposit ETH rent. The rent is the value field of this transaction.',
    note: 'Only a manager or the admin can do this. The contract divides this amount across the shares that exist right now. It does not loop over holders.',
    simulate: (address, account, config) =>
      makePublicClient(config).simulateContract({
        address,
        abi: propertyShareAbi,
        functionName: 'depositEth',
        value: amountWei,
        account,
      }),
  });
}

async function approveStable(flags: Flags): Promise<void> {
  const amount = requireDollars(flags, 'approve-stable');
  await broadcast(flags, {
    data: '0x',
    valueWei: 0n,
    action: `Approve the property contract to pull ${formatUnits(amount, 6)} mock dollars`,
    note: 'ERC-20 does not let a contract take your tokens until you approve it. ETH does not need this step. The next command is deposit-stable.',
    target: 'stablecoin',
    encode: (property, stablecoin) => encodeApproveStable(property, amount),
    simulate: (stablecoin, account, config, property) =>
      makePublicClient(config).simulateContract({
        address: stablecoin,
        abi: mockStablecoinAbi,
        functionName: 'approve',
        args: [property, amount],
        account,
      }),
  });
}

async function depositStable(flags: Flags): Promise<void> {
  const amount = requireDollars(flags, 'deposit-stable');
  const data = encodeDepositStable(amount);
  await broadcast(flags, {
    data,
    valueWei: 0n,
    action: `Deposit ${formatUnits(amount, 6)} mock dollars of rent`,
    note: 'Value is 0. The dollars move because you approved the property contract. If this reverts with an allowance error, run approve-stable first.',
    simulate: (address, account, config) =>
      makePublicClient(config).simulateContract({
        address,
        abi: propertyShareAbi,
        functionName: 'depositStable',
        args: [amount],
        account,
      }),
  });
}

async function claimEth(flags: Flags): Promise<void> {
  await broadcast(flags, {
    data: encodeClaimEth(),
    valueWei: 0n,
    action: 'Claim the ETH rent your shares have earned',
    note: 'Value is 0. The contract sends the ETH during the call. The books are updated before the send, so a receiver cannot be paid twice.',
    simulate: (address, account, config) =>
      makePublicClient(config).simulateContract({
        address,
        abi: propertyShareAbi,
        functionName: 'claimEth',
        account,
      }),
  });
}

async function claimStable(flags: Flags): Promise<void> {
  await broadcast(flags, {
    data: encodeClaimStable(),
    valueWei: 0n,
    action: 'Claim the mock-dollar rent your shares have earned',
    note: 'Value is 0. The contract sends the dollars during the call.',
    simulate: (address, account, config) =>
      makePublicClient(config).simulateContract({
        address,
        abi: propertyShareAbi,
        functionName: 'claimStable',
        account,
      }),
  });
}

function requireDollars(flags: Flags, sub: string): bigint {
  if (!flags.amount) {
    throw new Error(
      `property ${sub} needs --amount.\nExample: npm run wallet -- property ${sub} --amount 1000`,
    );
  }
  return parseMockDollars(flags.amount);
}

type BroadcastSpec = {
  data: HexLike;
  valueWei: bigint;
  action: string;
  note: string;
  /** 'property' calls PropertyShare. 'stablecoin' calls the mock dollar, after reading its address. */
  target?: 'property' | 'stablecoin';
  encode?: (property: `0x${string}`, stablecoin: `0x${string}`) => HexLike;
  simulate: (
    address: `0x${string}`,
    account: Awaited<ReturnType<typeof unlockAccount>>['account'],
    config: ReturnType<typeof loadConfig>,
    property: `0x${string}`,
  ) => Promise<unknown>;
};

type HexLike = `0x${string}`;

async function broadcast(flags: Flags, spec: BroadcastSpec): Promise<void> {
  printRealFundsWarning();
  const config = loadConfig(process.env, flags.chain);
  const unlocked = await unlockAccount(flags.index);
  const property = resolvePropertyAddress({ config, flag: flags.property });
  const overview = await readPropertyOverview({ config, property, who: unlocked.address });

  const target = spec.target === 'stablecoin' ? overview.stablecoin : property.address;
  const data = spec.encode ? spec.encode(property.address, overview.stablecoin) : spec.data;

  const prepared: PreparedCall = await prepareCall({
    config,
    account: unlocked.account,
    path: unlocked.path,
    to: target,
    data,
    valueWei: spec.valueWei,
    action: spec.action,
    note: `${spec.note}\nProperty from ${property.source}: ${property.address}`,
    simulate: () => spec.simulate(target, unlocked.account, config, property.address),
  });
  console.log(`Property from ${property.source}: ${property.address}`);
  console.log(prepared.preview);
  await confirmYes(flags.yes);
  const sent = await prepared.send();
  console.log(`Broadcast. Transaction hash: ${sent.hash}`);
}

async function loadOverview(flags: Flags) {
  const config = loadConfig(process.env, flags.chain);
  const unlocked = flags.address ? undefined : await unlockAccount(flags.index);
  const who = flags.address ? parseUserAddress(flags.address) : unlocked!.address;
  const property = resolvePropertyAddress({ config, flag: flags.property });
  return readPropertyOverview({ config, property, who });
}

function formatShares(shares: bigint, total: bigint): string {
  return `${shares.toString()} of ${total.toString()} (${percentOf(shares, total)} of the property)`;
}

/** 4 decimal places. 250000 of 1000000 is 25.0000%. 1 of 1000000 is 0.0001%. */
function percentOf(part: bigint, whole: bigint): string {
  if (whole === 0n) return '0%';
  const scaled = (part * 1_000_000n) / whole;
  const wholePercent = scaled / 10_000n;
  const frac = (scaled % 10_000n).toString().padStart(4, '0');
  return `${wholePercent.toString()}.${frac}%`;
}

function printOverview(snapshot: Awaited<ReturnType<typeof readPropertyOverview>>): void {
  console.log(`Property contract: ${snapshot.address}`);
  console.log(`Source:            ${snapshot.source}`);
  console.log(`Token:             ${snapshot.tokenName} (${snapshot.symbol})`);
  console.log(`Property name:     ${snapshot.propertyName}`);
  console.log(`Street text:       ${snapshot.streetAddress}`);
  console.log(`Document URI:      ${snapshot.documentUri}`);
  console.log(`Document hash:     ${snapshot.documentHash}`);
  console.log('The hash is a label for a file. The chain does not own the building, and this lesson has no file.');
  console.log(`Play dollar:       ${snapshot.stablecoin} (${snapshot.stableSymbol})`);
  console.log('');
  console.log(`You:               ${snapshot.you}`);
  console.log(`Your shares:       ${formatShares(snapshot.yourShares, snapshot.totalSupply)}`);
  console.log(`On the allowlist:  ${snapshot.youAllowed ? 'yes' : 'no'}`);
  console.log(`Manager or admin:  ${snapshot.youAreManager ? 'yes, you may deposit rent and edit the allowlist' : 'no'}`);
  console.log('');
  console.log(`ETH you can claim:     ${formatEther(snapshot.claimableEthWei)} ETH`);
  console.log(`Dollars you can claim: ${formatUnits(snapshot.claimableStableBase, 6)} ${snapshot.stableSymbol}`);
  console.log('');
  console.log(`ETH deposited by managers: ${formatEther(snapshot.ethDepositedWei)} ETH`);
  console.log(`ETH the math assigned:     ${formatEther(snapshot.ethAccountedWei)} ETH`);
  console.log(`ETH holders have claimed:  ${formatEther(snapshot.ethClaimedWei)} ETH`);
  console.log(`ETH sitting on the contract: ${formatEther(snapshot.contractEthWei)} ETH`);
  console.log('Deposited counts what managers sent. Accounted counts what holders can claim.');
  console.log('The gap is rounding dust. It is not paid to the last caller.');
  console.log('');
  console.log('These are free reads. No signature, no fee, no nonce.');
}
