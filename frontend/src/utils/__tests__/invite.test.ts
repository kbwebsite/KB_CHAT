/**
 * PE-1A/PE-1B: post-auth destination resume.
 * Invite tokens and profile names survive signup/login; arbitrary URLs
 * and path tricks never become destinations.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  hasPendingDestination,
  isOnboarded,
  markOnboarded,
  stashPendingInvite,
  stashPendingProfile,
  takePostAuthDestination,
} from '../invite'

beforeEach(() => {
  localStorage.clear()
})

describe('takePostAuthDestination', () => {
  it('returns null when nothing pending', () => {
    expect(takePostAuthDestination()).toBeNull()
    expect(hasPendingDestination()).toBe(false)
  })

  it('restores a stashed invite and clears it (one-shot)', () => {
    stashPendingInvite('abc123_-X')
    expect(hasPendingDestination()).toBe(true)
    expect(takePostAuthDestination()).toBe('/join/abc123_-X')
    expect(takePostAuthDestination()).toBeNull()
  })

  it('restores a stashed profile when no invite pending', () => {
    stashPendingProfile('@alex.morgan')
    expect(takePostAuthDestination()).toBe('/u/alex.morgan')
    expect(takePostAuthDestination()).toBeNull()
  })

  it('prefers invite over profile', () => {
    stashPendingProfile('alex')
    stashPendingInvite('tok123')
    expect(takePostAuthDestination()).toBe('/join/tok123')
    expect(takePostAuthDestination()).toBe('/u/alex')
  })

  it('rejects path tricks and blanks', () => {
    stashPendingInvite('../../etc/passwd')
    expect(takePostAuthDestination()).toBeNull()
    stashPendingInvite('   ')
    expect(takePostAuthDestination()).toBeNull()
    expect(hasPendingDestination()).toBe(false)
    stashPendingProfile('/u/evil?q=1')
    expect(takePostAuthDestination()).toBeNull()
  })
})

describe('onboarding flag', () => {
  it('is per-user, defaults to show for real ids', () => {
    expect(isOnboarded(42)).toBe(false)
    expect(isOnboarded(null)).toBe(true)
    expect(isOnboarded(undefined)).toBe(true)
    markOnboarded(42)
    expect(isOnboarded(42)).toBe(true)
    expect(isOnboarded(43)).toBe(false)
  })
})
