import { Address, BigInt, ethereum, dataSource } from '@graphprotocol/graph-ts';

import * as stake from '../generated/MaxxStake/MaxxStake';

import { MaxxStake, Participant, Stake, League } from '../generated/schema';

const ADDRESS_ZERO = Address.fromString(
  '0x0000000000000000000000000000000000000000'
);

export function handleStake(event: stake.Stake): void {
  const contract = stake.MaxxStake.bind(dataSource.address());

  let stakeId = event.params.stakeId;
  let _stake = getStake(stakeId.toHex());

  let contractStake = contract.stakes(stakeId);

  _stake.name = contractStake.value0;
  _stake.owner = contractStake.value1.toHex();
  _stake.amount = contractStake.value2;
  _stake.shares = contractStake.value3;
  _stake.duration = contractStake.value4;
  _stake.startTime = contractStake.value5;
  _stake.endTime = contractStake.value5.plus(contractStake.value4);
  _stake.status = 'ACTIVE';
  _stake.save();

  let maxxStake = getMaxxStake();
  maxxStake.totalStakes = maxxStake.totalStakes.plus(BigInt.fromI32(1));
  maxxStake.totalShares = contract.totalShares();

  let timestamp = event.block.timestamp;
  let day = timestamp.minus(maxxStake.launchDate).div(BigInt.fromI32(86400));
  maxxStake.shareFactor = BigInt.fromI32(1).minus(
    day.div(BigInt.fromI32(3333))
  );
  if (maxxStake.totalStakes == BigInt.fromI32(0)) {
    maxxStake.avgStakeAmount = _stake.amount;
    maxxStake.avgStakeDuration = _stake.duration;
  } else {
    let oldAvgAmount = maxxStake.avgStakeAmount;
    let oldTotalAmount = oldAvgAmount.times(maxxStake.totalStakes);
    maxxStake.avgStakeAmount = oldTotalAmount
      .plus(_stake.amount)
      .div(maxxStake.totalStakes.plus(BigInt.fromI32(1)));

    let oldAvgDuration = maxxStake.avgStakeDuration;
    let oldTotalDuration = oldAvgDuration.times(maxxStake.totalStakes);
    maxxStake.avgStakeDuration = oldTotalDuration
      .plus(_stake.duration)
      .div(maxxStake.totalStakes.plus(BigInt.fromI32(1)));
  }
  maxxStake.totalStakes = maxxStake.totalStakes.plus(BigInt.fromI32(1));
  maxxStake.save();

  let participant = getParticipant(event.params.user.toHex());
}

export function handleUnstake(event: stake.Unstake): void {
  const contract = stake.MaxxStake.bind(dataSource.address());
  const stakeId = event.params.stakeId;
  let _stake = getStake(stakeId.toHex());
  if (event.block.timestamp.lt(_stake.endTime)) {
    _stake.status = 'WITHDRAWN_EARLY';
  } else if (
    event.block.timestamp.gt(
      _stake.endTime.plus(BigInt.fromI32(86400).times(BigInt.fromI32(14)))
    )
  ) {
    _stake.status = 'WITHDRAWN_LATE';
  } else {
    _stake.status = 'WITHDRAWN';
  }

  _stake.save();
}

function handleStakeNameChange(event: stake.StakeNameChange): void {
  const stakeId = event.params.stakeId;
  let _stake = getStake(stakeId.toHex());
  _stake.name = event.params.name;
  _stake.save();
}

function handleLaunchDateUpdated(event: stake.LaunchDateUpdated): void {
  let maxxStake = getMaxxStake();
  maxxStake.launchDate = event.params.launchDate;
  maxxStake.save();
}

function handleLiquidityAmplifierSet(event: stake.LiquidityAmplifierSet): void {
  let maxxStake = getMaxxStake();
  maxxStake.liquidityAmplifier = event.params.liquidityAmplifier;
  maxxStake.save();
}

function handleFreeClaimSet(event: stake.FreeClaimSet): void {
  let maxxStake = getMaxxStake();
  maxxStake.freeClaim = event.params.freeClaim;
  maxxStake.save();
}

function handleMaxxGenesisSet(event: stake.MaxxGenesisSet): void {
  let maxxStake = getMaxxStake();
  maxxStake.maxxGenesis = event.params.maxxGenesis;
  maxxStake.save();
}

function handleMaxxBoostSet(event: stake.MaxxBoostSet): void {
  let maxxStake = getMaxxStake();
  maxxStake.maxxBoost = event.params.maxxBoost;
  maxxStake.save();
}

function handleNftBonusPercentageSet(event: stake.NftBonusPercentageSet): void {
  let maxxStake = getMaxxStake();
  maxxStake.nftBonusPercentage = event.params.nftBonusPercentage;
  maxxStake.save();
}

function handleNftBonusSet(event: stake.NftBonusSet): void {
  let maxxStake = getMaxxStake();
  maxxStake.nftBonus = event.params.nftBonus;
  maxxStake.save();
}

function handleBaseURISet(event: stake.BaseURISet): void {
  let maxxStake = getMaxxStake();
  maxxStake.baseURI = event.params.baseURI;
  maxxStake.save();
}

function handleAcceptedNftAdded(event: stake.AcceptedNftAdded): void {
  let maxxStake = getMaxxStake();
  let acceptedNfts = maxxStake.acceptedNfts;
  acceptedNfts.push(event.params.nft);
  maxxStake.acceptedNfts = acceptedNfts;
  maxxStake.save();
}

function handleAcceptedNftRemoved(event: stake.AcceptedNftRemoved): void {
  let maxxStake = getMaxxStake();
  let acceptedNfts = maxxStake.acceptedNfts;
  acceptedNfts = acceptedNfts.filter((nft) => nft != event.params.nft);
  maxxStake.acceptedNfts = acceptedNfts;
  maxxStake.save();
}

function getMaxxStake(): MaxxStake {
  const contract = stake.MaxxStake.bind(dataSource.address());

  let maxxStake = MaxxStake.load(dataSource.address().toHex());

  if (maxxStake == null) {
    maxxStake = new MaxxStake(dataSource.address().toHex());
    maxxStake.maxxVault = contract.maxxVault();
    maxxStake.maxx = contract.maxx();
    maxxStake.maxxBoost = contract.maxxBoost();
    maxxStake.maxxGenesis = contract.maxxGenesis();
    maxxStake.launchDate = contract.launchDate();
    maxxStake.totalStakes = contract.idCounter();
    maxxStake.totalStakesActive = BigInt.fromI32(0);
    maxxStake.totalStakesWithdrawn = BigInt.fromI32(0);
    maxxStake.totalShares = contract.totalShares();
    maxxStake.shareFactor = BigInt.fromI32(1);
    maxxStake.avgStakeAmount = BigInt.fromI32(0);
    maxxStake.avgStakeDuration = BigInt.fromI32(0);
    maxxStake.save();
  }

  return maxxStake as MaxxStake;
}

function getStake(id: string): Stake {
  let stake = Stake.load(id);
  if (stake == null) {
    stake = new Stake(id);
  }
  return stake as Stake;
}

function getParticipant(id: string): Participant {
  let participant = Participant.load(id);
  if (participant == null) {
    participant = new Participant(id);
    // participant.dailyDeposits = [];
    // participant.effectiveDailyDeposits = [];
    // participant.effectiveUserReferrals = [];
    participant.participated = true;
    participant.save();
  }
  return participant as Participant;
}
