import { Address, BigInt, ethereum, dataSource } from '@graphprotocol/graph-ts';

import * as freeClaim from '../generated/FreeClaim/FreeClaim';

import { FreeClaim, Referral, Referrer, Claim } from '../generated/schema';

const ADDRESS_ZERO = Address.fromString(
  '0x0000000000000000000000000000000000000000'
);

export function handleUserClaim(event: freeClaim.UserClaim): void {
  const contract = freeClaim.FreeClaim.bind(dataSource.address());

  let claimId =
    event.transaction.hash.toHex() + '-' + event.params.user.toHex();
  let claim = new Claim(claimId);

  claim.user = event.params.user;
  claim.amount = event.params.amount;
  claim.save();
}

export function handleReferral(event: freeClaim.Referral): void {
  const contract = freeClaim.FreeClaim.bind(dataSource.address());
  const referralId = event.transaction.hash.toHex();
  let referral = new Referral(referralId);
  let referrer = getReferrer(event.params.referrer.toHex());
  referrer.totalReferrals = referrer.totalReferrals.plus(BigInt.fromI32(1));
  referrer.totalReferralAmount = referrer.totalReferralAmount.plus(
    event.params.amount
  );
  referrer.save();

  let claim = getClaim(
    event.transaction.hash.toHex() + '-' + event.params.user.toHex()
  );
  claim.referrer = event.params.user.toHex();
  claim.save();

  referral.referrer = event.params.referrer;
  referral.referral = event.params.user;
  referral.referredAmount = event.params.amount;
  referral.timestamp = event.block.timestamp;
  referral.save();
}

export function handleMaxxSet(event: freeClaim.MaxxSet): void {
  let freeClaim = getFreeClaim();
  freeClaim.maxx = event.params.maxx;
  freeClaim.save();
}

export function handleMerkleRootSet(event: freeClaim.MerkleRootSet): void {
  let freeClaim = getFreeClaim();
  freeClaim.merkleRoot = event.params.merkleRoot;
  freeClaim.save();
}

export function handleLaunchDateUpdated(
  event: freeClaim.LaunchDateUpdated
): void {
  let freeClaim = getFreeClaim();
  freeClaim.launchDate = event.params.launchDate;
  freeClaim.save();
}

function getFreeClaim(): FreeClaim {
  const contract = freeClaim.FreeClaim.bind(dataSource.address());

  let freeClaim = FreeClaim.load(dataSource.address().toHex());
  if (freeClaim == null) {
    freeClaim = new FreeClaim(dataSource.address().toHex());
    freeClaim.launchDate = contract.launchDate();
    freeClaim.merkleRoot = contract.merkleRoot();
    freeClaim.maxx = contract.maxx();
    freeClaim.totalClaimed = BigInt.fromI32(0);
    freeClaim.totalReferralAmount = BigInt.fromI32(0);
    freeClaim.save();
  }

  return freeClaim as FreeClaim;
}

function getReferrer(id: string): Referrer {
  let referrer = Referrer.load(id);
  if (referrer == null) {
    referrer = new Referrer(id);
    referrer.totalReferrals = BigInt.fromI32(0);
    referrer.totalReferralAmount = BigInt.fromI32(0);
  }
  return referrer as Referrer;
}

function getClaim(id: string): Claim {
  let claim = Claim.load(id);
  if (claim == null) {
    claim = new Claim(id);
    claim.user = ADDRESS_ZERO;
    claim.amount = BigInt.fromI32(0);
    claim.save();
  }
  return claim as Claim;
}
