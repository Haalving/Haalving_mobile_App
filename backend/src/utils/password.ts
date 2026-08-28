import bcrypt from 'bcryptjs';

/**
 * bcryptjs, not bcrypt: it is pure JavaScript, so a Windows workstation with no
 * build toolchain installs the same lockfile the Linux CI does. The cost
 * difference is a few milliseconds per login and buys us one fewer native build.
 */
const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A comparison that costs the same whether or not the account exists.
 *
 * Without it, "no such email" returns in under a millisecond while a real one
 * takes ~250ms of bcrypt — and that difference enumerates the staff list to
 * anyone with a stopwatch.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.OqMfN6Z6WQnCkbLvOSY3Z0i.a3Wh9nS';

export async function verifyPasswordConstantTime(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}
