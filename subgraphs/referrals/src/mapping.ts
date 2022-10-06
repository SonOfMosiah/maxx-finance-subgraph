import { Address, BigInt, ethereum, dataSource } from '@graphprotocol/graph-ts';

import * as amplifier from '../generated/LiquidityAmplifier/LiquidityAmplifier';
import * as freeClaim from '../generated/FreeClaim/FreeClaim';
// import * as stake from '../generated/MaxxStake/MaxxStake';
// import * as maxx from '../generated/MaxxFinance/MaxxFinance';

import { Referrer, Referral } from '../generated/schema';

const ADDRESS_ZERO = Address.fromString(
  '0x0000000000000000000000000000000000000000'
);

export function handleAmplifierReferral(event: amplifier.Referral): void {
  let referrer = getReferrer(event.params.referrer.toHex());
  referrer.totalReferrals = referrer.totalReferrals.plus(BigInt.fromI32(1));
  referrer.save();

  let id = event.transaction.hash.toHex();
  let referral = new Referral(id);
  referral.referral = event.params.user;
  referral.referrer = event.params.referrer.toHex();
  referral.type = 'AMPLIFIER';
  referral.timestamp = event.block.timestamp;
  referral.save();
}

export function handleFreeClaimReferral(event: freeClaim.Referral): void {
  let referrer = getReferrer(event.params.referrer.toHex());
  referrer.totalReferrals = referrer.totalReferrals.plus(BigInt.fromI32(1));
  referrer.save();

  let id = event.transaction.hash.toHex();
  let referral = new Referral(id);
  referral.referral = event.params.user;
  referral.referrer = event.params.referrer.toHex();
  referral.type = 'FREECLAIM';
  referral.timestamp = event.block.timestamp;
  referral.save();
}

function getReferrer(id: string): Referrer {
  let referrer = Referrer.load(id);
  if (referrer == null) {
    referrer = new Referrer(id);
    referrer.totalReferrals = BigInt.fromI32(0);
    referrer.save();
  }
  return referrer as Referrer;
}
