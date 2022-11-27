import {
  Address,
  BigInt,
  log,
  ethereum,
  dataSource,
  Bytes,
} from '@graphprotocol/graph-ts';

import * as stake from '../generated/MaxxStake/MaxxStake';

import { MaxxStake, Participant, Stake, League } from '../generated/schema';

const ADDRESS_ZERO = Address.fromString(
  '0x0000000000000000000000000000000000000000'
);

export function handleStake(event: stake.Stake): void {
  const contract = stake.MaxxStake.bind(dataSource.address());

  let stakeId = event.params.stakeId;
  let contractStake = contract.stakes(stakeId);
  let _stake = getStake(stakeId.toString(), contractStake.value1.toHex());

  let endTime = contract.endTimes(stakeId);

  _stake.name = contractStake.value0;
  _stake.owner = contractStake.value1.toHex();
  _stake.amount = contractStake.value2;
  _stake.shares = contractStake.value3;
  _stake.duration = contractStake.value4;
  _stake.startTime = contractStake.value5;
  _stake.endTime = endTime;
  _stake.status = 'ACTIVE';
  _stake.lastUpdated = event.block.timestamp;
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
  let contractStake = contract.stakes(stakeId);
  let _stake = getStake(stakeId.toString(), event.params.user.toHex());
  _stake.owner = event.params.user.toHex();
  let withdrawnAmount = event.params.amount;
  let amount = _stake.amount;
  _stake.withdrawnAmount = withdrawnAmount;
  _stake.withdrawnTime = event.block.timestamp;
  // TODO calculate full interest
  let timeStaked = event.block.timestamp.minus(_stake.startTime);
  let daysStaked = timeStaked.div(BigInt.fromI32(86400));
  let shares = _stake.shares;
  let duration = _stake.duration;
  let durationDays = duration.div(BigInt.fromI32(86400));
  let fullDurationInterest = shares
    .times(durationDays.div(BigInt.fromI32(365)))
    .times(BigInt.fromI32(18185))
    .div(BigInt.fromI32(10000));
  let interest = daysStaked
    .times(shares)
    .times(durationDays)
    .times(BigInt.fromI32(18185))
    .div(BigInt.fromI32(10000))
    .div(BigInt.fromI32(365))
    .div(durationDays);

  if (interest.gt(fullDurationInterest)) {
    interest = fullDurationInterest;
  }

  let fullAmount = amount.plus(interest);

  if (withdrawnAmount.gt(_stake.amount)) {
    _stake.interest = withdrawnAmount.minus(_stake.amount);
  } else {
    log.info('stakeId: {}, fullAmount: {}, withdrawnAmount: {}, penalty: {}', [
      stakeId.toString(),
      fullAmount.toString(),
      withdrawnAmount.toString(),
      fullAmount.minus(withdrawnAmount).toString(),
    ]);
    _stake.penalties = fullAmount.minus(withdrawnAmount);
  }
  if (event.block.timestamp.lt(_stake.endTime)) {
    _stake.status = 'WITHDRAWN_EARLY';
  } else if (
    event.block.timestamp.gt(
      _stake.endTime.plus(
        BigInt.fromI32(86400).times(BigInt.fromI32(14)).div(BigInt.fromI32(336))
      )
    )
  ) {
    _stake.status = 'WITHDRAWN_LATE';
  } else {
    _stake.status = 'WITHDRAWN';
  }
  _stake.lastUpdated = event.block.timestamp;
  _stake.save();
}

export function handleStakeNameChange(event: stake.StakeNameChange): void {
  const contract = stake.MaxxStake.bind(dataSource.address());
  const stakeId = event.params.stakeId;
  let contractStake = contract.stakes(stakeId);
  let _stake = getStake(stakeId.toString(), contractStake.value1.toHex());
  _stake.name = event.params.name;
  _stake.lastUpdated = event.block.timestamp;
  _stake.save();
}

export function handleLaunchDateUpdated(event: stake.LaunchDateUpdated): void {
  let maxxStake = getMaxxStake();
  maxxStake.launchDate = event.params.newLaunchDate;
  maxxStake.save();
}

export function handleLiquidityAmplifierSet(
  event: stake.LiquidityAmplifierSet
): void {
  let maxxStake = getMaxxStake();
  maxxStake.liquidityAmplifier = event.params.liquidityAmplifier;
  maxxStake.save();
}

export function handleFreeClaimSet(event: stake.FreeClaimSet): void {
  let maxxStake = getMaxxStake();
  maxxStake.freeClaim = event.params.freeClaim;
  maxxStake.save();
}

export function handleBaseURISet(event: stake.BaseURISet): void {
  let maxxStake = getMaxxStake();
  maxxStake.baseURI = event.params.baseUri;
  maxxStake.save();
}

export function handleAcceptedNftAdded(event: stake.AcceptedNftAdded): void {
  let maxxStake = getMaxxStake();
  let acceptedNfts = maxxStake.acceptedNfts;
  acceptedNfts.push(event.params.nft);
  maxxStake.acceptedNfts = acceptedNfts;
  maxxStake.save();
}

export function handleAcceptedNftRemoved(
  event: stake.AcceptedNftRemoved
): void {
  let maxxStake = getMaxxStake();
  let acceptedNfts = maxxStake.acceptedNfts;
  let removedNft = event.params.nft;
  let newAcceptedNfts = new Array<Bytes>();
  for (let i = 0; i < acceptedNfts.length; i++) {
    if (acceptedNfts[i] != removedNft) {
      newAcceptedNfts.push(acceptedNfts[i]);
    }
  }
  maxxStake.acceptedNfts = newAcceptedNfts;
  maxxStake.save();
}

export function handleTransfer(event: stake.Transfer): void {
  const contract = stake.MaxxStake.bind(dataSource.address());
  let tokenId = event.params.tokenId;
  let contractStake = contract.stakes(tokenId);
  let participant = getParticipant(event.params.from.toHex());
  let _stake = getStake(tokenId.toString(), participant.id);
  if (event.params.to === ADDRESS_ZERO || event.params.to === null) {
    _stake.owner = event.params.from.toHex();
  } else {
    let participant = getParticipant(event.params.to.toHex());
    _stake.owner = participant.id;
  }
  _stake.lastUpdated = event.block.timestamp;
  _stake.save();
}

export function handleOwnershipTransferred(
  event: stake.OwnershipTransferred
): void {
  let maxxStake = getMaxxStake();
  maxxStake.owner = event.params.newOwner;
  maxxStake.save();
}

function getMaxxStake(): MaxxStake {
  const contract = stake.MaxxStake.bind(dataSource.address());

  let maxxStake = MaxxStake.load(dataSource.address().toHex());

  if (maxxStake == null) {
    maxxStake = new MaxxStake(dataSource.address().toHex());
    maxxStake.maxxVault = contract.maxxVault();
    maxxStake.maxx = contract.maxx();
    maxxStake.freeClaim = contract.freeClaim();
    maxxStake.liquidityAmplifier = contract.liquidityAmplifier();
    maxxStake.launchDate = contract.launchDate();
    maxxStake.totalStakes = contract.idCounter();
    maxxStake.totalStakesActive = BigInt.fromI32(0);
    maxxStake.totalStakesWithdrawn = BigInt.fromI32(0);
    maxxStake.totalShares = contract.totalShares();
    maxxStake.shareFactor = BigInt.fromI32(1);
    maxxStake.avgStakeAmount = BigInt.fromI32(0);
    maxxStake.avgStakeDuration = BigInt.fromI32(0);
    let acceptedNfts = new Array<Bytes>();
    maxxStake.acceptedNfts = acceptedNfts;
    maxxStake.owner = contract.owner();
    maxxStake.save();
  }

  return maxxStake as MaxxStake;
}

function getStake(id: string, owner: string): Stake {
  let stake = Stake.load(id);
  if (stake === null) {
    stake = new Stake(id);
    stake.tokenId = BigInt.fromString(id);
    stake.name = '';
    if (owner === null) {
      stake.owner = ADDRESS_ZERO.toHex();
    } else {
      stake.owner = owner;
    }
    stake.amount = BigInt.fromI32(0);
    stake.shares = BigInt.fromI32(0);
    stake.duration = BigInt.fromI32(0);
    stake.startTime = BigInt.fromI32(0);
    stake.endTime = BigInt.fromI32(0);
    stake.interest = BigInt.fromI32(0);
    stake.penalties = BigInt.fromI32(0);
    stake.withdrawnTime = BigInt.fromI32(0);
    stake.withdrawnAmount = BigInt.fromI32(0);
    stake.status = 'active';
    stake.lastUpdated = BigInt.fromI32(0);
    stake.save();
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

// function calculateLeagues(id: string, totalShares: BigInt): Void {
//   let league = League.load(id);
//   if (id == null) {
//     league = new League(id);
//     let sortedStakesByShares = Array<Stake>();
//     league.sortedStakesByShares = sortedStakesByShares;
//     league.countInA = BigInt.fromI32(0);
//     league.countInB = BigInt.fromI32(0);
//     league.countInC = BigInt.fromI32(0);
//     league.countInD = BigInt.fromI32(0);
//     league.countInE = BigInt.fromI32(0);
//     league.countInF = BigInt.fromI32(0);
//     league.countInG = BigInt.fromI32(0);
//     league.countInH = BigInt.fromI32(0);
//     league.save();
//   }

//   let amountA = totalShares.div(BigInt.fromI32(100_000_000));
//   let amountB = totalShares.div(BigInt.fromI32(10_000_000));
//   let amountC = totalShares.div(BigInt.fromI32(1_000_000));
//   let amountD = totalShares.div(BigInt.fromI32(100_000));
//   let amountE = totalShares.div(BigInt.fromI32(10_000));
//   let amountF = totalShares.div(BigInt.fromI32(1_000));
//   let amountG = totalShares.div(BigInt.fromI32(100));
//   let amountH = totalShares.div(BigInt.fromI32(10));

//   let index = findIndex(amountA);
// }

// function findIndex(amountA: BigInt): BigInt {
//   let index = BigInt.fromI32(0);
//   let i = BigInt.fromI32(0);
//   while (i < amountA) {
//     index = index.plus(BigInt.fromI32(1));
//     i = i.plus(BigInt.fromI32(1));
//   }
//   return index;
// }

// // function to insert a new element to a sorted array
// function insertSorted(arr: Array<Stake>, stake: Stake): Array<Stake> {
//   let i = BigInt.fromI32(0);
//   while (i < arr.length) {
//     if (arr[i].shares < stake.shares) {
//       arr.splice(i, 0, stake);
//       return arr;
//     }
//     i = i.plus(BigInt.fromI32(1));
//   }
//   arr.push(stake);
//   return arr;
// }

// // sort an array in descending order
// function sortArray(arr: Array<Stake>): Array<Stake> {
//   let sortedArray = Array<Stake>();
//   let i = BigInt.fromI32(0);
//   while (i < arr.length) {
//     sortedArray = insertSorted(sortedArray, arr[i]);
//     i = i.plus(BigInt.fromI32(1));
//   }
//   return sortedArray;
// }
