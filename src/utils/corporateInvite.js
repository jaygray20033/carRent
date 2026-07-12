// Invite token helpers for B2B corporate employee onboarding (UC-62/63).
import crypto from 'node:crypto';
import { INVITE_TTL_MS } from '../constants/corporatePricing.js';

/** Cryptographically random invite token (hex, 32 bytes → 64 chars). */
export function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** True when inviteExpiresAt is in the past (or missing). */
export function isInviteExpired(inviteExpiresAt, now = new Date()) {
  if (!inviteExpiresAt) return true;
  return new Date(inviteExpiresAt).getTime() <= now.getTime();
}

/** Compute invite expiry = now + 48h. */
export function inviteExpiresAt(from = new Date()) {
  return new Date(from.getTime() + INVITE_TTL_MS);
}

export default { generateInviteToken, isInviteExpired, inviteExpiresAt };
