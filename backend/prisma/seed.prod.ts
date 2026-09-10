import {
  prisma,
  seedCatalog,
  seedConfig,
  seedConfiguration,
  seedProgramShape,
  seedRoles,
} from './seed.js';

/**
 * THE PRODUCTION SEED — reference and configuration, and NOT ONE PERSON.
 *
 * A real deployment needs the substrate the product runs on: the RBAC matrix, the
 * program shape and cycle config, the SLA/leave/chain/flow configuration, and the
 * plan substrate — the catalogue and the PlanTemplates coaches assign. It must NOT
 * contain the demo's story: no staff accounts, no demo clients, no arrivals, tasks,
 * circles or meals. Those are what `seed.ts` writes, and `seed.ts` now refuses to
 * run under `NODE_ENV=production` for exactly this reason.
 *
 * THE LEVEL-UP RULEBOOKS ARE NOT SEEDED HERE. `level_criteria` starts empty in
 * production and is written in Configuration › Level-up by the Super Admin or
 * Operations Head; the phone shows no level-up targets until it is. The dev
 * seed (`seed.ts`) fills it from the demo's capture as a fixture.
 *
 * Real people arrive through the product itself: staff are created in People &
 * Access, clients through onboarding and the arrivals pipeline. Nothing here invents
 * a human.
 */
async function main(): Promise<void> {
  console.log('\nSeeding HAALVING for PRODUCTION — reference and config only, no people.\n');

  await seedRoles();
  await seedProgramShape();
  await seedConfiguration();
  await seedConfig();
  /* seedCatalog carries the plan substrate: tracks, catalogue items and the
     PlanTemplates. Any `createdById` pointing at a demo author is nulled (the
     column is nullable) because those authors do not exist here. */
  await seedCatalog();

  console.log('\nProduction substrate seeded. No staff, no clients, no demo data.\n');
}

main()
  .catch((err: Error) => {
    console.error('\nProduction seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
