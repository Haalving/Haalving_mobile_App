-- THE SUPER ADMIN'S LIVE ROLE ROW NEVER RECEIVED `approveCommunity`.
-- The permission arrived in code after the roles table was first written, and
-- `can()` reads the live row before the code default — so on a deployment
-- whose admin row predates it, nobody could approve a gathering, a challenge, a
-- game day or a zone: every one stayed Pending and never reached a client.
-- Give the live admin row what the code gives it. Idempotent, and it touches
-- nothing People & Access has granted or withdrawn on any other role.
UPDATE "roles"
   SET "perms" = array_append("perms", 'approveCommunity'),
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "key" = 'admin'
   AND NOT ('approveCommunity' = ANY("perms"));
