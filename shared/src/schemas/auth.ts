import { z } from 'zod';

import { email, password, phone } from './common.js';

/**
 * Auth request bodies.
 *
 * Two doors, deliberately different. Staff sign in with an email and a password
 * from a desk; a client signs in with the phone in their hand and a one-time
 * code. Neither door accepts the other's credential, so a leaked staff password
 * cannot be replayed against the client app and vice versa.
 */

export const staffLoginSchema = z.object({
  email,
  /* not the `password` rule: an EXISTING password only has to be present.
     Applying the composition rule here would lock out anyone whose password
     predates it, and would leak which rule the stored password fails. */
  password: z.string().min(1, 'Enter your password'),
});
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const otpRequestSchema = z.object({
  phone,
});
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  phone,
  code: z.string().regex(/^\d{6}$/, 'The code is six digits'),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/**
 * The web console reads its refresh token from an httpOnly cookie, so the body
 * is empty there. Mobile has no cookie jar worth the name, so it sends the token
 * it was given. One route, both audiences.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
