import { Address, BigInt, ethereum, dataSource } from '@graphprotocol/graph-ts';

import * as amplifier from '../generated/LiquidityAmplifier/LiquidityAmplifier';

import { SetStakeAddressCall } from '../generated/LiquidityAmplifier/LiquidityAmplifier';

import {
  LiquidityAmplifier,
  Day,
  Participant,
  Deposit,
  Referral,
  Claim,
} from '../generated/schema';

const ADDRESS_ZERO = Address.fromString(
  '0x0000000000000000000000000000000000000000'
);

export function handleDeposit(event: amplifier.Deposit): void {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());

  let depositId = event.transaction.hash.toHex();
  let deposit = new Deposit(depositId);

  let participant = getParticipant(event.params.user.toHex());

  deposit.participant = event.params.user.toHex();
  deposit.amount = event.params.amount;
  if (event.params.referrer != ADDRESS_ZERO) {
    createReferral(event);
    deposit.effectiveAmount = event.params.amount;
    //   .times(BigInt.fromI32(11))
    //   .div(BigInt.fromI32(10));
  } else {
    deposit.effectiveAmount = event.params.amount;
  }

  let day = getDay(contract.getDay());
  day.maticDeposits = day.maticDeposits.plus(deposit.amount);
  day.effectiveMaticDeposits = day.effectiveMaticDeposits.plus(
    deposit.effectiveAmount
  );
  deposit.day = day.id;
  deposit.save();
}

export function handleClaim(event: amplifier.Claim): void {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());
  const claimId = event.transaction.hash.toHex();
  let claim = new Claim(claimId);

  claim.participant = event.params.user.toHex();
  claim.amount = event.params.amount;

  claim.save();
}

function getLiquidityAmplifier(): LiquidityAmplifier {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());

  let liquidityAmplifier = LiquidityAmplifier.load(
    dataSource.address().toHex()
  );
  if (liquidityAmplifier == null) {
    liquidityAmplifier = new LiquidityAmplifier(dataSource.address().toHex());
    liquidityAmplifier.launchDate = contract.launchDate();
    liquidityAmplifier.maxxVault = contract.maxxVault();
    liquidityAmplifier.maxx = contract.maxx();
    liquidityAmplifier.stake = contract.stake();
    liquidityAmplifier.save();
  }

  return liquidityAmplifier as LiquidityAmplifier;
}

function getDay(dayId: number): Day {
  const contract = amplifier.LiquidityAmplifier.bind(dataSource.address());

  let day = Day.load(dayId.toString());
  if (day == null) {
    day = new Day(dayId.toString());
    // day.maxxAllocation = contract.getMaxxDailyAllocation(
    //   BigInt.fromString(dayId.toString()).toI32()
    // );
    day.maticDeposits = BigInt.fromI32(0);
    day.effectiveMaticDeposits = BigInt.fromI32(0);
    day.save();
  }

  return day as Day;
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

function createReferral(event: amplifier.Deposit): void {
  let id = event.transaction.hash.toHex();
  let referral = new Referral(id);
  referral.referral = event.params.user.toHex();
  referral.referrer = event.params.referrer.toHex();
  referral.referredAmount = event.params.amount;
  referral.effectiveReferredAmount = event.params.amount;
  // .times(BigInt.fromI32(11))
  // .div(BigInt.fromI32(10));
  referral.save();
}
