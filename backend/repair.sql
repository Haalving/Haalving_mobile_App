BEGIN;
-- AlterTable
ALTER TABLE "challenges" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "returnNote" TEXT;

-- AlterTable
ALTER TABLE "circle_messages" ADD COLUMN     "mealId" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "culturePhotos" JSONB,
ADD COLUMN     "goalLedger" JSONB,
ADD COLUMN     "trackers" JSONB;

-- AlterTable
ALTER TABLE "game_days" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "returnNote" TEXT;

-- AlterTable
ALTER TABLE "gatherings" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "returnNote" TEXT;

-- AlterTable
ALTER TABLE "meals" ALTER COLUMN "aiStars" DROP NOT NULL,
ALTER COLUMN "aiConf" DROP NOT NULL,
ALTER COLUMN "aiNote" DROP NOT NULL;

-- AlterTable
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "pod_covers" ADD CONSTRAINT "pod_covers_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "pod_seats" ADD CONSTRAINT "pod_seats_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_pkey" PRIMARY KEY ("postId", "clientId");

-- AlterTable
ALTER TABLE "program_shape" ADD CONSTRAINT "program_shape_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("key");

-- AlterTable
ALTER TABLE "sla_config" ADD CONSTRAINT "sla_config_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "task_dones" ADD CONSTRAINT "task_dones_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "task_exceptions" ADD CONSTRAINT "task_exceptions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "task_responses" ADD CONSTRAINT "task_responses_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "due" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "pill" TEXT,
ADD COLUMN     "sourceRule" TEXT,
ADD COLUMN     "workType" "WorklistType",
ALTER COLUMN "date" DROP NOT NULL,
ALTER COLUMN "startMin" DROP NOT NULL,
ALTER COLUMN "durMin" DROP NOT NULL,
ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "team_feed_reads" ADD CONSTRAINT "team_feed_reads_pkey" PRIMARY KEY ("userId");

-- AlterTable
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "worklist_items" ADD CONSTRAINT "worklist_items_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "zone_members" ADD CONSTRAINT "zone_members_pkey" PRIMARY KEY ("zoneId", "clientId");

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "proposedById" TEXT,
ADD COLUMN     "returnNote" TEXT,
ADD CONSTRAINT "zones_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "client_prefs" (
    "clientId" TEXT NOT NULL,
    "notifPrefs" JSONB NOT NULL DEFAULT '{"water":true,"workout":true,"meals":true,"sleep":false}',
    "consents" JSONB NOT NULL DEFAULT '{"health":true,"mealai":true}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_prefs_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_moods" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "mood" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_moods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_circle_reads" (
    "clientId" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_circle_reads_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "client_plans" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "pillar" TEXT NOT NULL,
    "templateId" TEXT,
    "draft" BOOLEAN NOT NULL DEFAULT true,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "time" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_clientId_idx" ON "push_tokens"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_moods_clientId_cycle_day_key" ON "client_moods"("clientId", "cycle", "day");

-- CreateIndex
CREATE INDEX "client_plans_templateId_idx" ON "client_plans"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "client_plans_clientId_pillar_key" ON "client_plans"("clientId", "pillar");

-- CreateIndex
CREATE INDEX "approval_events_approvalId_at_idx" ON "approval_events"("approvalId", "at");

-- CreateIndex
CREATE INDEX "approvals_status_idx" ON "approvals"("status");

-- CreateIndex
CREATE INDEX "approvals_ownerId_idx" ON "approvals"("ownerId");

-- CreateIndex
CREATE INDEX "approvals_clientId_idx" ON "approvals"("clientId");

-- CreateIndex
CREATE INDEX "arrival_events_arrivalId_at_idx" ON "arrival_events"("arrivalId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "arrivals_promotedClientId_key" ON "arrivals"("promotedClientId");

-- CreateIndex
CREATE INDEX "arrivals_status_idx" ON "arrivals"("status");

-- CreateIndex
CREATE INDEX "arrivals_step_idx" ON "arrivals"("step");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_subjectType_subjectId_idx" ON "audit_logs"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_deliveries_messageId_key" ON "broadcast_deliveries"("messageId");

-- CreateIndex
CREATE INDEX "broadcast_deliveries_clientId_idx" ON "broadcast_deliveries"("clientId");

-- CreateIndex
CREATE INDEX "broadcasts_sentAt_idx" ON "broadcasts"("sentAt");

-- CreateIndex
CREATE INDEX "catalog_items_pillar_idx" ON "catalog_items"("pillar");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_tags_slug_key" ON "catalog_tags"("slug");

-- CreateIndex
CREATE INDEX "challenge_entries_clientId_idx" ON "challenge_entries"("clientId");

-- CreateIndex
CREATE INDEX "challenges_approvedAt_idx" ON "challenges"("approvedAt");

-- CreateIndex
CREATE INDEX "challenges_position_idx" ON "challenges"("position");

-- CreateIndex
CREATE UNIQUE INDEX "circle_messages_clientId_seq_key" ON "circle_messages"("clientId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "client_flows_clientId_templateId_key" ON "client_flows"("clientId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_userId_key" ON "clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_plan_idx" ON "clients"("plan");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "community_posts_zoneId_postedAt_idx" ON "community_posts"("zoneId", "postedAt");

-- CreateIndex
CREATE INDEX "community_posts_clientId_idx" ON "community_posts"("clientId");

-- CreateIndex
CREATE INDEX "community_posts_pinned_idx" ON "community_posts"("pinned");

-- CreateIndex
CREATE INDEX "deviations_clientId_idx" ON "deviations"("clientId");

-- CreateIndex
CREATE INDEX "deviations_at_idx" ON "deviations"("at");

-- CreateIndex
CREATE INDEX "digest_entries_clientId_idx" ON "digest_entries"("clientId");

-- CreateIndex
CREATE INDEX "digest_entries_date_idx" ON "digest_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "digest_entries_date_clientId_key" ON "digest_entries"("date", "clientId");

-- CreateIndex
CREATE INDEX "flow_steps_templateId_position_idx" ON "flow_steps"("templateId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "followup_dismissals_draftId_key" ON "followup_dismissals"("draftId");

-- CreateIndex
CREATE INDEX "followup_dismissals_clientId_idx" ON "followup_dismissals"("clientId");

-- CreateIndex
CREATE INDEX "followup_dismissals_reason_idx" ON "followup_dismissals"("reason");

-- CreateIndex
CREATE UNIQUE INDEX "followup_drafts_circleMessageId_key" ON "followup_drafts"("circleMessageId");

-- CreateIndex
CREATE INDEX "followup_drafts_clientId_idx" ON "followup_drafts"("clientId");

-- CreateIndex
CREATE INDEX "followup_drafts_status_idx" ON "followup_drafts"("status");

-- CreateIndex
CREATE INDEX "followup_drafts_createdById_idx" ON "followup_drafts"("createdById");

-- CreateIndex
CREATE INDEX "game_answers_clientId_idx" ON "game_answers"("clientId");

-- CreateIndex
CREATE INDEX "game_days_approvedAt_idx" ON "game_days"("approvedAt");

-- CreateIndex
CREATE INDEX "game_days_position_idx" ON "game_days"("position");

-- CreateIndex
CREATE UNIQUE INDEX "game_questions_gameDayId_position_key" ON "game_questions"("gameDayId", "position");

-- CreateIndex
CREATE INDEX "gathering_enrolments_clientId_idx" ON "gathering_enrolments"("clientId");

-- CreateIndex
CREATE INDEX "gatherings_approvedAt_idx" ON "gatherings"("approvedAt");

-- CreateIndex
CREATE INDEX "gatherings_position_idx" ON "gatherings"("position");

-- CreateIndex
CREATE UNIQUE INDEX "home_seen_userId_tabKey_key" ON "home_seen"("userId", "tabKey");

-- CreateIndex
CREATE UNIQUE INDEX "leave_cover_responses_leaveId_userId_key" ON "leave_cover_responses"("leaveId", "userId");

-- CreateIndex
CREATE INDEX "leave_events_leaveId_at_idx" ON "leave_events"("leaveId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "leave_reallocations_leaveId_clientId_seatKey_key" ON "leave_reallocations"("leaveId", "clientId", "seatKey");

-- CreateIndex
CREATE UNIQUE INDEX "leave_session_covers_leaveId_taskId_date_key" ON "leave_session_covers"("leaveId", "taskId", "date");

-- CreateIndex
CREATE INDEX "leaves_staffId_idx" ON "leaves"("staffId");

-- CreateIndex
CREATE INDEX "leaves_status_idx" ON "leaves"("status");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_clientId_key" ON "meal_plans"("clientId");

-- CreateIndex
CREATE INDEX "meals_clientId_idx" ON "meals"("clientId");

-- CreateIndex
CREATE INDEX "meals_finalStars_idx" ON "meals"("finalStars");

-- CreateIndex
CREATE INDEX "medical_summaries_status_idx" ON "medical_summaries"("status");

-- CreateIndex
CREATE INDEX "medical_summaries_clientId_idx" ON "medical_summaries"("clientId");

-- CreateIndex
CREATE INDEX "notices_toId_createdAt_idx" ON "notices"("toId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notif_rules_title_key" ON "notif_rules"("title");

-- CreateIndex
CREATE INDEX "otps_phone_expiresAt_idx" ON "otps"("phone", "expiresAt");

-- CreateIndex
CREATE INDEX "plan_templates_pillar_level_idx" ON "plan_templates"("pillar", "level");

-- CreateIndex
CREATE INDEX "pod_covers_clientId_seatKey_from_to_idx" ON "pod_covers"("clientId", "seatKey", "from", "to");

-- CreateIndex
CREATE INDEX "pod_seats_staffId_idx" ON "pod_seats"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "pod_seats_clientId_pillar_key_key" ON "pod_seats"("clientId", "pillar_key");

-- CreateIndex
CREATE INDEX "post_comments_postId_at_idx" ON "post_comments"("postId", "at");

-- CreateIndex
CREATE INDEX "post_comments_clientId_idx" ON "post_comments"("clientId");

-- CreateIndex
CREATE INDEX "post_likes_clientId_idx" ON "post_likes"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "program_shape_version_key" ON "program_shape"("version");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_dones_taskId_date_key" ON "task_dones"("taskId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "task_exceptions_taskId_date_key" ON "task_exceptions"("taskId", "date");

-- CreateIndex
CREATE INDEX "task_proposals_taskId_idx" ON "task_proposals"("taskId");

-- CreateIndex
CREATE INDEX "task_responses_userId_idx" ON "task_responses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_responses_taskId_userId_key" ON "task_responses"("taskId", "userId");

-- CreateIndex
CREATE INDEX "tasks_date_idx" ON "tasks"("date");

-- CreateIndex
CREATE INDEX "tasks_clientId_idx" ON "tasks"("clientId");

-- CreateIndex
CREATE INDEX "tasks_kind_idx" ON "tasks"("kind");

-- CreateIndex
CREATE INDEX "team_posts_createdAt_idx" ON "team_posts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_dept_idx" ON "users"("dept");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "worklist_items_ownerId_status_idx" ON "worklist_items"("ownerId", "status");

-- CreateIndex
CREATE INDEX "worklist_items_clientId_idx" ON "worklist_items"("clientId");

-- CreateIndex
CREATE INDEX "zone_members_clientId_idx" ON "zone_members"("clientId");

-- CreateIndex
CREATE INDEX "zones_approvedAt_idx" ON "zones"("approvedAt");

-- CreateIndex
CREATE INDEX "zones_position_idx" ON "zones"("position");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_shapeVersion_fkey" FOREIGN KEY ("shapeVersion") REFERENCES "program_shape"("version") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_seats" ADD CONSTRAINT "pod_seats_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_seats" ADD CONSTRAINT "pod_seats_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capacity" ADD CONSTRAINT "capacity_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_entries" ADD CONSTRAINT "digest_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_seen" ADD CONSTRAINT "home_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_shape" ADD CONSTRAINT "program_shape_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_messages" ADD CONSTRAINT "circle_messages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_messages" ADD CONSTRAINT "circle_messages_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "circle_messages" ADD CONSTRAINT "circle_messages_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_drafts" ADD CONSTRAINT "followup_drafts_circleMessageId_fkey" FOREIGN KEY ("circleMessageId") REFERENCES "circle_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_dismissals" ADD CONSTRAINT "followup_dismissals_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "followup_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_dismissals" ADD CONSTRAINT "followup_dismissals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followup_dismissals" ADD CONSTRAINT "followup_dismissals_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_promotedClientId_fkey" FOREIGN KEY ("promotedClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrivals" ADD CONSTRAINT "arrivals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_events" ADD CONSTRAINT "arrival_events_arrivalId_fkey" FOREIGN KEY ("arrivalId") REFERENCES "arrivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arrival_events" ADD CONSTRAINT "arrival_events_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_exceptions" ADD CONSTRAINT "task_exceptions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dones" ADD CONSTRAINT "task_dones_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dones" ADD CONSTRAINT "task_dones_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_responses" ADD CONSTRAINT "task_responses_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_responses" ADD CONSTRAINT "task_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_proposals" ADD CONSTRAINT "task_proposals_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_posts" ADD CONSTRAINT "team_posts_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_feed_reads" ADD CONSTRAINT "team_feed_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaves" ADD CONSTRAINT "leaves_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_reallocations" ADD CONSTRAINT "leave_reallocations_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_reallocations" ADD CONSTRAINT "leave_reallocations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_reallocations" ADD CONSTRAINT "leave_reallocations_toId_fkey" FOREIGN KEY ("toId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_session_covers" ADD CONSTRAINT "leave_session_covers_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_session_covers" ADD CONSTRAINT "leave_session_covers_toId_fkey" FOREIGN KEY ("toId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_cover_responses" ADD CONSTRAINT "leave_cover_responses_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_cover_responses" ADD CONSTRAINT "leave_cover_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_covers" ADD CONSTRAINT "pod_covers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_covers" ADD CONSTRAINT "pod_covers_coverId_fkey" FOREIGN KEY ("coverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_covers" ADD CONSTRAINT "pod_covers_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "leaves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_toId_fkey" FOREIGN KEY ("toId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_steps" ADD CONSTRAINT "flow_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "flow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_flows" ADD CONSTRAINT "client_flows_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_flows" ADD CONSTRAINT "client_flows_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "flow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worklist_items" ADD CONSTRAINT "worklist_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worklist_items" ADD CONSTRAINT "worklist_items_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worklist_items" ADD CONSTRAINT "worklist_items_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_finalById_fkey" FOREIGN KEY ("finalById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_summaries" ADD CONSTRAINT "medical_summaries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_summaries" ADD CONSTRAINT "medical_summaries_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deviations" ADD CONSTRAINT "deviations_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gatherings" ADD CONSTRAINT "gatherings_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_enrolments" ADD CONSTRAINT "gathering_enrolments_gatheringId_fkey" FOREIGN KEY ("gatheringId") REFERENCES "gatherings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gathering_enrolments" ADD CONSTRAINT "gathering_enrolments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_entries" ADD CONSTRAINT "challenge_entries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_days" ADD CONSTRAINT "game_days_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_days" ADD CONSTRAINT "game_days_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_questions" ADD CONSTRAINT "game_questions_gameDayId_fkey" FOREIGN KEY ("gameDayId") REFERENCES "game_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "game_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_members" ADD CONSTRAINT "zone_members_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_members" ADD CONSTRAINT "zone_members_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_announce_prefs" ADD CONSTRAINT "client_announce_prefs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_prefs" ADD CONSTRAINT "client_prefs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_moods" ADD CONSTRAINT "client_moods_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_circle_reads" ADD CONSTRAINT "client_circle_reads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_byId_fkey" FOREIGN KEY ("byId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "broadcast_deliveries_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "circle_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "plan_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_plans" ADD CONSTRAINT "client_plans_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
