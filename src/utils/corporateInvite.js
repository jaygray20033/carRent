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

/**
 * Evaluate a shareable multi-use join link's usability.
 * Returns { valid, reason } — reason is one of NOT_FOUND | REVOKED | EXPIRED | EXHAUSTED.
 * maxUses null = unlimited; expiresAt null = never expires.
 */
export function inviteLinkStatus(link, now = new Date()) {
  if (!link) return { valid: false, reason: 'NOT_FOUND' };
  if (!link.isActive) return { valid: false, reason: 'REVOKED' };
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= now.getTime()) {
    return { valid: false, reason: 'EXPIRED' };
  }
  if (link.maxUses != null && link.usedCount >= link.maxUses) {
    return { valid: false, reason: 'EXHAUSTED' };
  }
  return { valid: true };
}

export default { generateInviteToken, isInviteExpired, inviteExpiresAt, inviteLinkStatus };
