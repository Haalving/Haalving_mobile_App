import { z } from 'zod';

import { availability, deptEnum, email, isoDate, password, phone, roleEnum } from './common.js';

/**
 * The staff employee record — People & Access edits it, Time & Cover reads its
 * availability, and the conflict engine refuses a booking outside it.
 */

export const userStatusEnum = z.enum(['active', 'inactive']);

export const emergencyContact = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(40),
});

/**
 * Every field optional, but ROLE IS NOT EDITABLE HERE. A role change rewrites
 * what a person can see, so it travels its own route with its own audit reason
 * rather than riding along with a corrected phone number.
 */
/**
 * WHAT A COACH LOOKS LIKE IN THE CLIENT'S MARKETPLACE.
 *
 * The four facts a directory needs that a staff record does not otherwise carry.
 * `clients` is deliberately absent: the caseload is COUNTED from the pod seats
 * they actually hold, so a number a client is trusting cannot be typed in.
 *
 * Every field optional — a half-filled listing is better than none, and the card
 * reads a zero as "not stated" rather than as a claim.
 */
export const coachListingSchema = z.object({
  /** rupees a month */
  price: z.number().int().min(0).max(1000000).nullish(),
  years: z.number().int().min(0).max(60).nullish(),
  /* one decimal, as a star row is read */
  rating: z.number().min(0).max(5).nullish(),
  /* three is what the card shows; a longer list is a page nobody scrolls */
  spec: z.array(z.string().trim().min(1).max(40)).max(3).nullish(),
});
export type CoachListingInput = z.infer<typeof coachListingSchema>;

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: roleEnum,
    email: email.optional(),
    phone: phone.optional(),
    /** Omitted for a client; a staff account without one cannot sign in. */
    password: password.optional(),
    /** A one-line note on the person, as the demo's `memo`. */
    subtitle: z.string().trim().max(280).optional(),
    /**
     * Which of the four coach benches this person sits on. Required for `hod`,
     * whose whole scope is "the clients of my department" — an HoD with no
     * department sees nobody, which reads as a permissions bug rather than an
     * unfinished record.
     */
    dept: deptEnum.nullish(),
    /** 1 = senior. The cover board reaches for an L2 when an L1 is away. */
    level: z.number().int().min(1).max(2).optional(),
    joinedAt: isoDate.optional(),
    tz: z.string().trim().max(64).default('Asia/Kolkata'),
    avail: availability.optional(),
    emergency: emergencyContact.nullish(),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    /**
     * The private note on a person, kept APART from `subtitle`. The subtitle is
     * the line under their name that everyone with the page can read; the memo is
     * what the Super Admin wrote about them, and only `managePeople` ever sees it.
     */
    memo: z.string().trim().max(2000).nullish(),
    /**
     * The CV's filename, without the file. There is no object store yet, so the
     * record carries the name a human recognises and `cv` — the KEY — stays null:
     * a key pointing at nothing reads as an attachment that fails to open.
     */
    cvName: z.string().trim().max(200).nullish(),
    /* a coach can be listed the moment they are hired — the price is asked on
       the same form, so nobody has to remember to come back and set one */
    coach: coachListingSchema.nullish(),
    status: userStatusEnum.default('active'),
  })
  .refine((v) => v.role === 'client' || !!v.email, {
    message: 'A console account needs an email to sign in with',
    path: ['email'],
  })
  .refine((v) => v.role !== 'client' || !!v.phone, {
    message: 'A client signs in by phone, so the number is required',
    path: ['phone'],
  })
  .refine((v) => v.role !== 'hod' || !!v.dept, {
    message: 'A Head of Department leads one bench — say which',
    path: ['dept'],
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;


export const updateUserSchema = z
  .object({
    /** the marketplace listing; null takes the person off the directory */
    coach: coachListingSchema.nullish(),
    name: z.string().trim().min(1).max(120).optional(),
    email: email.optional(),
    phone: phone.optional(),
    subtitle: z.string().trim().max(280).nullish(),
    dept: deptEnum.nullish(),
    level: z.number().int().min(1).max(2).nullish(),
    joinedAt: isoDate.optional(),
    tz: z.string().trim().max(64).optional(),
    emergency: emergencyContact.nullish(),
    tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    memo: z.string().trim().max(2000).nullish(),
    /** The CV in object storage: its key, and the name a human recognises. */
    cvKey: z.string().trim().max(400).nullish(),
    cvName: z.string().trim().max(200).nullish(),
    status: userStatusEnum.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** A role change, on its own, with the reason it happened. */
export const changeRoleSchema = z.object({
  role: roleEnum,
  dept: deptEnum.nullish(),
  reason: z.string().trim().min(3).max(500),
});
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;

export const updateAvailabilitySchema = z.object({
  avail: availability,
});
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

export const listUsersQuery = z.object({
  role: roleEnum.optional(),
  dept: deptEnum.optional(),
  status: userStatusEnum.optional(),
  q: z.string().trim().max(120).optional(),
});
export type ListUsersQuery = z.infer<typeof listUsersQuery>;
