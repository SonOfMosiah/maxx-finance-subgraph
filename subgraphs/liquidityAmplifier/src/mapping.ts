import {
  log,
  Address,
  BigInt,
  ethereum,
  dataSource,
} from '@graphprotocol/graph-ts';

import * as amplifier from '../generated/LiquidityAmplifier/LiquidityAmplifier';

import {
  LiquidityAmplifier,
  Day,
  Participant,
  Deposit,
  Referral,
  Referrer,
  Claim,
} from '../generated/schema';

const ADDRESS_ZERO = Address.fromString(
  '0x0000000000000000000000000000000000000000'
);

export function handleDeposit(event: amplifier.Deposit): void {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());

  let liquidityAmplifier = getLiquidityAmplifier();

  let depositId = event.transaction.hash.toHex();
  let deposit = new Deposit(depositId);

  deposit.participant = event.params.user.toHex();
  deposit.amount = event.params.amount;
  if (event.params.referrer != ADDRESS_ZERO) {
    let referrer = getReferrer(event.params.referrer.toHex());
    referrer.totalReferrals = referrer.totalReferrals.plus(BigInt.fromI32(1));
    referrer.totalReferredAmount = referrer.totalReferredAmount.plus(
      event.params.amount
    );
    referrer.totalBonus = referrer.totalBonus.plus(
      event.params.amount.div(BigInt.fromI32(20))
    );
    referrer.save();
    deposit.effectiveAmount = event.params.amount
      .times(BigInt.fromI32(11))
      .div(BigInt.fromI32(10));
  } else {
    deposit.effectiveAmount = event.params.amount;
  }

  let contractDay = contract.getDay();
  let day = getDay(contractDay);
  day.maxxAllocation = contract.getMaxxDailyAllocation(contractDay);
  day.maticDeposited = day.maticDeposited.plus(deposit.amount);
  day.effectiveMaticDeposited = contract.getEffectiveMaticDailyDeposit(
    BigInt.fromString(day.id)
  );

  day.totalDeposits = day.totalDeposits.plus(BigInt.fromI32(1));
  day.save();

  // updateMaxxAmounts();
  deposit.day = day.id;
  // let deposits = liquidityAmplifier.deposits;
  // deposits.push(deposit.id);
  // liquidityAmplifier.deposits = deposits;
  deposit.save();

  liquidityAmplifier.totalMatic = liquidityAmplifier.totalMatic.plus(
    deposit.amount
  );
  liquidityAmplifier.totalEffectiveMatic =
    liquidityAmplifier.totalEffectiveMatic.plus(deposit.effectiveAmount);
  liquidityAmplifier.save();

  let participant = getParticipant(event.params.user.toHex());
  participant.participated = true;
  let participantDailyDeposits = participant.dailyDeposits;
  participantDailyDeposits[contractDay.toI32()] = participantDailyDeposits[
    contractDay.toI32()
  ].plus(deposit.amount);

  participant.dailyDeposits = participantDailyDeposits;
  let participantEffectiveDailyDeposits = participant.effectiveDailyDeposits;
  participantEffectiveDailyDeposits[contractDay.toI32()] =
    participantEffectiveDailyDeposits[contractDay.toI32()].plus(
      deposit.effectiveAmount
    );
  participant.effectiveDailyDeposits = participantEffectiveDailyDeposits;
  participant.save();
}

export function handleClaim(event: amplifier.Claim): void {
  let claim = getClaim(event);
  claim.participant = event.params.user.toHex();
  claim.amount = event.params.amount;
  claim.type = 'DEPOSIT';
  claim.save();

  let participant = getParticipant(event.params.user.toHex());
  let dailyClaimStatus = participant.dailyClaimStatus;
  dailyClaimStatus[event.params.day.toI32()] = true;
  participant.dailyClaimStatus = dailyClaimStatus;
  participant.save();
}

export function handleClaimReferral(event: amplifier.ClaimReferral): void {
  let participant = getParticipant(event.params.user.toHex());

  let claim = getClaim(event);
  claim.participant = event.params.user.toHex();
  claim.amount = event.params.amount;
  claim.type = 'REFERRAL';
  claim.save();

  let referrer = getReferrer(event.params.user.toHex());
  referrer.status = 'CLAIMED';
  referrer.save();
}

export function handleReferral(event: amplifier.Referral): void {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());
  let id = event.transaction.hash.toHex();
  let referral = new Referral(id);
  referral.referral = event.params.user.toHex();
  referral.referrer = event.params.referrer.toHex();
  referral.referredAmount = event.params.amount;
  referral.effectiveReferredAmount = event.params.amount
    .times(BigInt.fromI32(11))
    .div(BigInt.fromI32(10));
  let day = getDay(contract.getDay());
  day.effectiveMaticDeposited = contract.getEffectiveMaticDailyDeposit(
    BigInt.fromString(day.id)
  );
  day.save();
  referral.day = day.id;
  referral.timestamp = event.block.timestamp;
  // let liquidityAmplifier = getLiquidityAmplifier();
  // let referrals = liquidityAmplifier.referrals;
  // referrals.push(referral.id);
  // liquidityAmplifier.referrals = referrals;
  // liquidityAmplifier.save();
  referral.save();
}

export function handleStakeAddressSet(event: amplifier.StakeAddressSet): void {
  let liquidityAmplifier = getLiquidityAmplifier();
  liquidityAmplifier.stake = event.params.stake;
  liquidityAmplifier.save();
}

export function handleMaxxGenesisSet(event: amplifier.MaxxGenesisSet): void {
  let liquidityAmplifier = getLiquidityAmplifier();
  liquidityAmplifier.maxxGenesis = event.params.maxxGenesis;
  liquidityAmplifier.save();
}

export function handleLaunchDateUpdated(
  event: amplifier.LaunchDateUpdated
): void {
  let liquidityAmplifier = getLiquidityAmplifier();
  liquidityAmplifier.launchDate = event.params.newLaunchDate;
  liquidityAmplifier.save();
}

export function handleMaxxGenesisMinted(
  event: amplifier.MaxxGenesisMinted
): void {
  let liquidityAmplifier = getLiquidityAmplifier();
  liquidityAmplifier.maxxGenesisMinted =
    liquidityAmplifier.maxxGenesisMinted.plus(BigInt.fromI32(1));
  liquidityAmplifier.save();
}

function getLiquidityAmplifier(): LiquidityAmplifier {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());

  let liquidityAmplifier = LiquidityAmplifier.load(
    dataSource.address().toHex()
  );
  if (liquidityAmplifier == null) {
    liquidityAmplifier = new LiquidityAmplifier(dataSource.address().toHex());
    liquidityAmplifier.maxxVault = contract.maxxVault();
    liquidityAmplifier.launchDate = contract.launchDate();
    liquidityAmplifier.stake = contract.stake();
    liquidityAmplifier.maxx = contract.maxx();
    liquidityAmplifier.maxxGenesis = contract.maxxGenesis();
    liquidityAmplifier.maxxGenesisMinted = BigInt.fromI32(0);
    liquidityAmplifier.totalMatic = BigInt.fromI32(0);
    liquidityAmplifier.totalEffectiveMatic = BigInt.fromI32(0);
    liquidityAmplifier.totalMaxxPerMatic = BigInt.fromI32(0);
    let deposits = new Array<string>();
    liquidityAmplifier.deposits = deposits;
    liquidityAmplifier.nextDepositUpdateIndex = BigInt.fromI32(0);
    let referrals = new Array<string>();
    liquidityAmplifier.referrals = referrals;
    liquidityAmplifier.nextReferralUpdateIndex = BigInt.fromI32(0);
    liquidityAmplifier.save();
  }

  return liquidityAmplifier as LiquidityAmplifier;
}

function initAllDays(dayId: string): Day {
  for (let i = 0; i < 60; i++) {
    let day = new Day(i.toString());
    day.maxxAllocation = BigInt.fromI32(0);
    day.maticDeposited = BigInt.fromI32(0);
    day.effectiveMaticDeposited = BigInt.fromI32(0);
    day.totalDeposits = BigInt.fromI32(0);
    day.maxxPerEffectiveMatic = BigInt.fromI32(0);
    day.save();
  }
  let day = Day.load(dayId);
  return day as Day;
}

function initMaxxAllocations(dayNum: BigInt): void {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());
  for (let i = 0; i <= dayNum.toI32(); i++) {
    let day = getSingleDay(BigInt.fromI32(i));
    if (day.maxxAllocation.equals(BigInt.fromI32(0))) {
      let maxxAllocation = contract.getMaxxDailyAllocation(BigInt.fromI32(i));
      day.maxxAllocation = maxxAllocation;
      day.save();
    }
  }
}

function getDay(dayNum: BigInt): Day {
  let dayId = dayNum.toI32().toString();
  let day = Day.load(dayId);
  if (day == null) {
    day = initAllDays(dayId);
  }
  initMaxxAllocations(dayNum);
  day.save();
  return day as Day;
}

function getSingleDay(dayNum: BigInt): Day {
  let contract = amplifier.LiquidityAmplifier.bind(dataSource.address());
  let dayId = dayNum.toI32().toString();
  let day = Day.load(dayId);
  if (day == null) {
    day = new Day(dayId);
    day.maxxAllocation = contract.getMaxxDailyAllocation(dayNum);
    day.maticDeposited = BigInt.fromI32(0);
    day.effectiveMaticDeposited = BigInt.fromI32(0);
    day.totalDeposits = BigInt.fromI32(0);
    day.maxxPerEffectiveMatic = BigInt.fromI32(0);
    day.save();
  }
  return day as Day;
}

function getParticipant(id: string): Participant {
  let participant = Participant.load(id);
  if (participant == null) {
    participant = new Participant(id);
    let depositArray = new Array<BigInt>(60);
    let dailyClaimStatus = new Array<bool>(60);
    for (let i = 0; i < 60; i++) {
      depositArray[i] = BigInt.fromI32(0);
      dailyClaimStatus[i] = false;
    }
    participant.participated = false;
    participant.dailyDeposits = depositArray;
    participant.dailyClaimStatus = dailyClaimStatus;
    participant.effectiveDailyDeposits = depositArray;
    participant.save();
  }
  return participant as Participant;
}

function getReferrer(id: string): Referrer {
  let referrer = Referrer.load(id);
  if (referrer == null) {
    referrer = new Referrer(id);
    referrer.totalReferrals = BigInt.fromI32(0);
    referrer.totalReferredAmount = BigInt.fromI32(0);
    referrer.totalBonus = BigInt.fromI32(0);
    referrer.status = 'PENDING';
    referrer.save();
  }
  return referrer as Referrer;
}

function getClaim(event: ethereum.Event): Claim {
  let id = event.transaction.hash.toHex();
  let claim = Claim.load(id);
  if (claim == null) {
    claim = new Claim(id);
    claim.participant = event.transaction.from.toHex();
    claim.amount = BigInt.fromI32(0);
    claim.save();
  }
  return claim as Claim;
}

// function updateMaxxAmounts2(contractDay: BigInt): void {
//   let contract = amplifier.LiquidityAmplifier.bind(dataSource.address());
//   let effectiveAmount: BigInt;
//   let maxxPerEffectiveMatic: BigInt;
//   let liquidityAmplifier = getLiquidityAmplifier();
//   let updateIndex = liquidityAmplifier.nextDepositUpdateIndex.toI32();
//   let nextIndex = BigInt.fromI32(updateIndex);
//   if (liquidityAmplifier.deposits != null) {
//     let depositLength = liquidityAmplifier.deposits.length;
//     for (let i = updateIndex; i < depositLength; i++) {
//       let deposit = Deposit.load(liquidityAmplifier.deposits[i].toString());
//       if (deposit != null && BigInt.fromString(deposit.day).lt(contractDay)) {
//         let day = getSingleDay(BigInt.fromString(deposit.day));
//         if (day.maxxAllocation.equals(BigInt.fromI32(0))) {
//           day.maxxAllocation = contract.getMaxxDailyAllocation(
//             BigInt.fromString(day.id)
//           );
//           day.save();
//         }
//         effectiveAmount = contract.getEffectiveMaticDailyDeposit(
//           BigInt.fromString(day.id)
//         );
//         if (effectiveAmount.gt(BigInt.fromI32(0))) {
//           let maxxAllocation = day.maxxAllocation;
//           maxxPerEffectiveMatic = maxxAllocation.div(effectiveAmount);
//           let maxxAmount = deposit.effectiveAmount.times(maxxPerEffectiveMatic);
//           deposit.maxxAmount = maxxAmount;
//         }

//         deposit.save();
//         nextIndex = BigInt.fromI32(i + 1);
//         liquidityAmplifier.nextDepositUpdateIndex = nextIndex;
//         liquidityAmplifier.save();
//       }

//       if (contractDay.gt(BigInt.fromI32(58))) {
//         let updateIndex = liquidityAmplifier.nextDepositUpdateIndex.toI32();
//         for (let i = updateIndex; i < depositLength; i++) {
//           let deposit = Deposit.load(liquidityAmplifier.deposits[i].toString());
//           if (
//             deposit != null &&
//             BigInt.fromString(deposit.day).gt(BigInt.fromI32(58))
//           ) {
//             let day = getSingleDay(BigInt.fromString(deposit.day));
//             if (day.maxxAllocation.equals(BigInt.fromI32(0))) {
//               day.maxxAllocation = contract.getMaxxDailyAllocation(
//                 BigInt.fromString(day.id)
//               );
//               day.save();
//             }
//             effectiveAmount = contract.getEffectiveMaticDailyDeposit(
//               BigInt.fromString(day.id)
//             );
//             if (effectiveAmount.gt(BigInt.fromI32(0))) {
//               let maxxAllocation = day.maxxAllocation;
//               maxxPerEffectiveMatic = maxxAllocation.div(effectiveAmount);
//               day.maxxPerEffectiveMatic = maxxPerEffectiveMatic;
//               day.save();
//               let maxxAmount = deposit.effectiveAmount.times(
//                 maxxPerEffectiveMatic
//               );
//               deposit.maxxAmount = maxxAmount;
//             }
//             deposit.save();
//           }
//         }
//       }
//       updateIndex = liquidityAmplifier.nextReferralUpdateIndex.toI32();
//       nextIndex = BigInt.fromI32(updateIndex);
//       if (liquidityAmplifier.referrals != null) {
//         let referralLength = liquidityAmplifier.referrals.length;
//         for (let i = updateIndex; i < referralLength; i++) {
//           let referral = Referral.load(
//             liquidityAmplifier.referrals[i].toString()
//           );
//           if (referral != null) {
//             let day = getSingleDay(BigInt.fromString(referral.day));
//             maxxPerEffectiveMatic = day.maxxPerEffectiveMatic;
//             referral.maxxAmount = referral.referredAmount
//               .div(BigInt.fromI32(20))
//               .times(maxxPerEffectiveMatic);
//             referral.save();
//             nextIndex = BigInt.fromI32(i + 1);
//           }
//         }
//         liquidityAmplifier.nextReferralUpdateIndex = nextIndex;
//         liquidityAmplifier.save();
//       }
//     }
//   }
// }

// function updateMaxxAmounts(): void {
//   let contract = amplifier.LiquidityAmplifier.bind(dataSource.address());
//   let contractDay = contract.getDay();
//   if (contractDay.lt(BigInt.fromI32(61)) && contractDay.gt(BigInt.fromI32(0))) {
//     let liquidityAmplifier = getLiquidityAmplifier();
//     let previousDay = getSingleDay(contractDay.minus(BigInt.fromI32(1)));
//     let prevTotalDeposits = previousDay.totalDeposits;
//     let prevEffectiveMaticDeposited = previousDay.effectiveMaticDeposited;
//     let prevMaxxAllocation = previousDay.maxxAllocation;
//     if (
//       prevTotalDeposits.gt(BigInt.fromI32(0)) ||
//       prevEffectiveMaticDeposited.gt(BigInt.fromI32(0))
//     ) {
//       let maxxPerEffectiveMatic = prevMaxxAllocation.div(
//         prevEffectiveMaticDeposited
//       );
//       previousDay.maxxAllocation = prevMaxxAllocation;
//       previousDay.maxxPerEffectiveMatic = maxxPerEffectiveMatic;
//       previousDay.save();
//     }
//     updateMaxxAmounts2(contractDay);
//   }
// }
