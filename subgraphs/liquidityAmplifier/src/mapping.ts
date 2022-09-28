import { Address, BigInt, ethereum, dataSource } from '@graphprotocol/graph-ts';

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
      event.params.amount.div(BigInt.fromI32(10))
    );
    referrer.save();
    deposit.effectiveAmount = event.params.amount
      .times(BigInt.fromI32(11))
      .div(BigInt.fromI32(10));
  } else {
    deposit.effectiveAmount = event.params.amount;
  }

  let contractDay = BigInt.fromI32(contract.getDay());
  let day = getDay(contractDay);
  day.maticDeposited = day.maticDeposited.plus(deposit.amount);
  day.effectiveMaticDeposited = day.effectiveMaticDeposited.plus(
    deposit.effectiveAmount
  );
  day.totalDeposits = day.totalDeposits.plus(BigInt.fromI32(1));
  day.save();
  deposit.day = day.id;
  deposit.save();

  let liquidityAmplifier = getLiquidityAmplifier();

  liquidityAmplifier.totalMatic = liquidityAmplifier.totalMatic.plus(
    deposit.amount
  );
  liquidityAmplifier.totalEffectiveMatic =
    liquidityAmplifier.totalEffectiveMatic.plus(deposit.effectiveAmount);
  liquidityAmplifier.save();

  let participant = getParticipant(event.params.user.toHex());
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
}

export function handleClaimReferral(event: amplifier.ClaimReferral): void {
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
  let day = getDay(BigInt.fromI32(contract.getDay()));
  referral.day = day.id;
  referral.timestamp = event.block.timestamp;
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
    liquidityAmplifier.save();
  }

  return liquidityAmplifier as LiquidityAmplifier;
}

function initAllDays(): void {
  for (let i = 0; i < 60; i++) {
    let day = new Day(i.toString());
    day.maxxAllocation = BigInt.fromI32(0);
    day.maticDeposited = BigInt.fromI32(0);
    day.effectiveMaticDeposited = BigInt.fromI32(0);
    day.totalDeposits = BigInt.fromI32(0);
    day.save();
  }
}

function initMaxxAllocations(dayNum: BigInt): void {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());
  for (let i = 0; i < dayNum.toI32(); i++) {
    let day = getDay(BigInt.fromI32(i));
    if (day.maxxAllocation.equals(BigInt.fromI32(0))) {
      day.maxxAllocation = contract.getMaxxDailyAllocation(dayNum.toI32());
      day.save();
    }
  }
}

function getDay(dayNum: BigInt): Day {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());
  let dayId = dayNum.toI32().toString();
  let day = Day.load(dayId);
  if (day == null) {
    initAllDays();
    day = Day.load(dayId);
    if (day == null) {
      day = new Day(dayId);
      day.maxxAllocation = BigInt.fromI32(0);
      day.maticDeposited = BigInt.fromI32(0);
      day.effectiveMaticDeposited = BigInt.fromI32(0);
      day.totalDeposits = BigInt.fromI32(0);
      day.save();
    }
  }
  initMaxxAllocations(dayNum);
  day.save();
  return day as Day;
}

function getParticipant(id: string): Participant {
  let participant = Participant.load(id);
  if (participant == null) {
    participant = new Participant(id);
    let depositArray = new Array<BigInt>(60);
    for (let i = 0; i < 60; i++) {
      depositArray[i] = BigInt.fromI32(0);
    }
    participant.dailyDeposits = depositArray;
    participant.effectiveDailyDeposits = depositArray;
    participant.participated = true;
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
