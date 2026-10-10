import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export * from "./auth-schema";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

/** A restaurant group. One owner account (or more) sits over its stores. */
export const orgs = sqliteTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** Leadership access: owners see every store, area managers see the stores assigned to them. */
export const orgAccess = sqliteTable(
  "org_access",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    userId: text("user_id"),
    email: text("email"),
    name: text("name").notNull(),
    role: text("role", { enum: ["owner", "area_manager"] }).notNull(),
    storeIds: text("store_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("org_access_user_idx").on(t.userId), index("org_access_email_idx").on(t.email)],
);

export const stores = sqliteTable(
  "stores",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    number: text("number").notNull(),
    name: text("name").notNull(),
    city: text("city").notNull().default(""),
    pin: text("pin").notNull(),
    timezone: text("timezone").notNull().default("America/New_York"),
    ppaTarget: real("ppa_target").notNull().default(78),
    openingDueBy: text("opening_due_by").notNull().default("11:00"),
    closingDueBy: text("closing_due_by").notNull().default("01:00"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("stores_number_uq").on(t.number), index("stores_org_idx").on(t.orgId)],
);

/** Everyone on a store's roster — managers and staff. Staff sign in with store number + PIN. */
export const members = sqliteTable(
  "members",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    name: text("name").notNull(),
    initials: text("initials").notNull(),
    role: text("role").notNull(),
    isTrainer: integer("is_trainer", { mode: "boolean" }).notNull().default(false),
    email: text("email"),
    phone: text("phone"),
    pin: text("pin").notNull(),
    userId: text("user_id"),
    hireDate: text("hire_date").notNull(),
    status: text("status", { enum: ["active", "departed"] }).notNull().default("active"),
    departedOn: text("departed_on"),
    createdAt: createdAt(),
  },
  (t) => [
    index("members_store_idx").on(t.storeId),
    index("members_user_idx").on(t.userId),
    index("members_email_idx").on(t.email),
  ],
);

export const onboardingItems = sqliteTable(
  "onboarding_items",
  {
    id: id(),
    memberId: text("member_id").notNull(),
    phase: integer("phase").notNull(), // 30 | 60 | 90
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    dueDate: text("due_date").notNull(),
    sort: integer("sort").notNull().default(0),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    completedBy: text("completed_by"),
  },
  (t) => [index("onboarding_member_idx").on(t.memberId)],
);

/** A store-level session: staff PIN sign-in, or a manager who opened their store with the store PIN. */
export const storeSessions = sqliteTable("store_sessions", {
  token: text("token").primaryKey(),
  memberId: text("member_id").notNull(),
  storeId: text("store_id").notNull(),
  orgId: text("org_id").notNull(),
  userId: text("user_id"),
  method: text("method", { enum: ["pin", "store_pin", "demo"] }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
});

export const checklistTemplateItems = sqliteTable(
  "checklist_template_items",
  {
    id: id(),
    storeId: text("store_id").notNull(),
    type: text("type", { enum: ["opening", "closing"] }).notNull(),
    area: text("area").notNull(),
    title: text("title").notNull(),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("tmpl_store_idx").on(t.storeId, t.type)],
);

export const checklists = sqliteTable(
  "checklists",
  {
    id: id(),
    storeId: text("store_id").notNull(),
    type: text("type", { enum: ["opening", "closing"] }).notNull(),
    businessDate: text("business_date").notNull(),
    status: text("status", { enum: ["open", "verified", "submitted"] }).notNull().default("open"),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    verifiedById: text("verified_by_id"),
    verifiedByName: text("verified_by_name"),
    verifiedByRole: text("verified_by_role"),
    signature: text("signature"),
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
    note: text("note"),
  },
  (t) => [uniqueIndex("checklists_uq").on(t.storeId, t.type, t.businessDate)],
);

export const checklistLines = sqliteTable(
  "checklist_lines",
  {
    id: id(),
    checklistId: text("checklist_id").notNull(),
    area: text("area").notNull(),
    title: text("title").notNull(),
    sort: integer("sort").notNull().default(0),
    doneById: text("done_by_id"),
    doneByName: text("done_by_name"),
    initials: text("initials"),
    doneAt: integer("done_at", { mode: "timestamp_ms" }),
    /** Marked not applicable today, with the reason and who said so. */
    naReason: text("na_reason"),
    naBy: text("na_by"),
    naAt: integer("na_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("lines_checklist_idx").on(t.checklistId)],
);

export const shiftReports = sqliteTable(
  "shift_reports",
  {
    id: id(),
    storeId: text("store_id").notNull(),
    businessDate: text("business_date").notNull(),
    netSales: real("net_sales").notNull(),
    covers: integer("covers").notNull(),
    checks: integer("checks").notNull(),
    comps: real("comps").notNull().default(0),
    voids: real("voids").notNull().default(0),
    discounts: real("discounts").notNull().default(0),
    walkouts: integer("walkouts").notNull().default(0),
    eightySixed: text("eighty_sixed").notNull().default(""),
    notes: text("notes").notNull().default(""),
    source: text("source", { enum: ["manual", "csv"] }).notNull().default("manual"),
    submittedById: text("submitted_by_id"),
    submittedByName: text("submitted_by_name").notNull(),
    signature: text("signature"),
    submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("shift_reports_uq").on(t.storeId, t.businessDate)],
);

export const shiftReportLines = sqliteTable(
  "shift_report_lines",
  {
    id: id(),
    reportId: text("report_id").notNull(),
    memberId: text("member_id"),
    name: text("name").notNull(),
    role: text("role").notNull().default("server"),
    netSales: real("net_sales").notNull(),
    covers: integer("covers").notNull(),
    checks: integer("checks").notNull().default(0),
    wineBottles: integer("wine_bottles").notNull().default(0),
    desserts: integer("desserts").notNull().default(0),
  },
  (t) => [index("srl_report_idx").on(t.reportId), index("srl_member_idx").on(t.memberId)],
);

/** Pre-shift line-up (stand-up) run by a manager with everyone on the shift. */
export const lineups = sqliteTable(
  "lineups",
  {
    id: id(),
    storeId: text("store_id").notNull(),
    businessDate: text("business_date").notNull(),
    shift: text("shift", { enum: ["lunch", "dinner"] }).notNull(),
    callTime: text("call_time").notNull(),
    status: text("status", { enum: ["open", "signed"] }).notNull().default("open"),
    topics: text("topics").notNull().default(""),
    specials: text("specials").notNull().default(""),
    eightySix: text("eighty_six").notNull().default(""),
    vips: text("vips").notNull().default(""),
    runById: text("run_by_id"),
    runByName: text("run_by_name"),
    runByRole: text("run_by_role"),
    signature: text("signature"),
    signedAt: integer("signed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lineups_uq").on(t.storeId, t.businessDate, t.shift)],
);

export const lineupEntries = sqliteTable(
  "lineup_entries",
  {
    id: id(),
    lineupId: text("lineup_id").notNull(),
    memberId: text("member_id").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull(),
    scheduledStart: text("scheduled_start").notNull(),
    arrival: text("arrival", { enum: ["pending", "on_time", "late", "no_show", "swap_unapproved", "swapped_out"] })
      .notNull()
      .default("pending"),
    arrivedAt: text("arrived_at"),
    minutesLate: integer("minutes_late"),
    uniformOk: integer("uniform_ok", { mode: "boolean" }),
    uniformMissing: text("uniform_missing", { mode: "json" }).$type<string[]>().notNull().default([]),
    note: text("note").notNull().default(""),
    swapId: text("swap_id"),
    coverName: text("cover_name"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("lineup_entries_lineup_idx").on(t.lineupId), index("lineup_entries_member_idx").on(t.memberId)],
);

/** One infraction. Counts as a strike for 90 days unless excused. */
export const conductEvents = sqliteTable(
  "conduct_events",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    type: text("type", { enum: ["late", "dress_code", "no_show", "swap_protocol"] }).notNull(),
    businessDate: text("business_date").notNull(),
    detail: text("detail").notNull(),
    minutesLate: integer("minutes_late"),
    lineupId: text("lineup_id"),
    entryId: text("entry_id"),
    swapId: text("swap_id"),
    status: text("status", { enum: ["pending", "acknowledged", "refused", "excused"] }).notNull().default("pending"),
    ackSignature: text("ack_signature"),
    ackAt: integer("ack_at", { mode: "timestamp_ms" }),
    ackWitness: text("ack_witness"),
    excusedByName: text("excused_by_name"),
    excusedReason: text("excused_reason"),
    excusedAt: integer("excused_at", { mode: "timestamp_ms" }),
    recordedByName: text("recorded_by_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("conduct_member_idx").on(t.memberId, t.businessDate), index("conduct_store_idx").on(t.storeId, t.businessDate)],
);

/** Shift swap: valid only with a screenshot showing date, start time and written agreement. */
export const shiftSwaps = sqliteTable(
  "shift_swaps",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    businessDate: text("business_date").notNull(),
    shift: text("shift", { enum: ["lunch", "dinner"] }).notNull(),
    startTime: text("start_time").notNull(),
    fromMemberId: text("from_member_id").notNull(),
    fromName: text("from_name").notNull(),
    toMemberId: text("to_member_id").notNull(),
    toName: text("to_name").notNull(),
    screenshotKey: text("screenshot_key").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    hasDate: integer("has_date", { mode: "boolean" }),
    hasStartTime: integer("has_start_time", { mode: "boolean" }),
    hasWrittenAgreement: integer("has_written_agreement", { mode: "boolean" }),
    submittedByName: text("submitted_by_name").notNull(),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
  },
  (t) => [index("swaps_store_idx").on(t.storeId, t.businessDate)],
);

/** Progressive discipline: verbal → written → performance plan → termination (owner approves). */
export const disciplinaryActions = sqliteTable(
  "disciplinary_actions",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    step: text("step", { enum: ["verbal", "written", "plan", "termination"] }).notNull(),
    strikeCount: integer("strike_count").notNull(),
    eventIds: text("event_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    businessDate: text("business_date").notNull(),
    status: text("status", { enum: ["awaiting_signatures", "awaiting_owner", "final", "declined", "void"] })
      .notNull()
      .default("awaiting_signatures"),
    notes: text("notes").notNull().default(""),
    managerName: text("manager_name"),
    managerRole: text("manager_role"),
    managerSignature: text("manager_signature"),
    managerSignedAt: integer("manager_signed_at", { mode: "timestamp_ms" }),
    employeeSignature: text("employee_signature"),
    employeeSignedAt: integer("employee_signed_at", { mode: "timestamp_ms" }),
    employeeRefused: integer("employee_refused", { mode: "boolean" }).notNull().default(false),
    ownerName: text("owner_name"),
    ownerNote: text("owner_note"),
    ownerDecidedAt: integer("owner_decided_at", { mode: "timestamp_ms" }),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("discipline_member_idx").on(t.memberId), index("discipline_store_idx").on(t.storeId)],
);

/* ───────────────────────── Checkpoint B: the program ───────────────────────── */

/** One person's progress through one library module. */
export const trainingProgress = sqliteTable(
  "training_progress",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    memberId: text("member_id").notNull(),
    module: text("module").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    signedOffAt: integer("signed_off_at", { mode: "timestamp_ms" }),
    signedOffById: text("signed_off_by_id"),
    signedOffByName: text("signed_off_by_name"),
    signedOffByRole: text("signed_off_by_role"),
    trainerSignature: text("trainer_signature"),
    traineeSignature: text("trainee_signature"),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("training_progress_uq").on(t.memberId, t.module), index("training_store_idx").on(t.storeId)],
);

/** A graded floor exercise or skills check. 1–5 stars per criterion. */
export const grades = sqliteTable(
  "grades",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    memberRole: text("member_role").notNull(),
    rubric: text("rubric").notNull(),
    module: text("module").notNull(),
    businessDate: text("business_date").notNull(),
    tableNo: text("table_no").notNull().default(""),
    scores: text("scores", { mode: "json" }).$type<Record<string, number>>().notNull(),
    notes: text("notes", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
    summary: text("summary").notNull().default(""),
    average: real("average").notNull(),
    graderId: text("grader_id"),
    graderName: text("grader_name").notNull(),
    graderRole: text("grader_role").notNull(),
    graderSignature: text("grader_signature").notNull(),
    traineeSignature: text("trainee_signature"),
    approvedAt: integer("approved_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("grades_member_idx").on(t.memberId), index("grades_store_idx").on(t.storeId, t.businessDate)],
);

/** Manager-authored continuing education: seasonal menu, wine and cocktail changes. */
export const updates = sqliteTable(
  "updates",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeIds: text("store_ids", { mode: "json" }).$type<string[]>().notNull(),
    season: text("season").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    items: text("items", { mode: "json" }).$type<{ name: string; detail: string }[]>().notNull().default([]),
    quiz: text("quiz", { mode: "json" })
      .$type<{ id: string; q: string; choices: string[]; answer: number; why: string }[]>()
      .notNull()
      .default([]),
    roles: text("roles", { mode: "json" }).$type<string[]>().notNull().default([]),
    authorName: text("author_name").notNull(),
    authorRole: text("author_role").notNull(),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("updates_org_idx").on(t.orgId)],
);

export const updateReads = sqliteTable(
  "update_reads",
  {
    id: id(),
    updateId: text("update_id").notNull(),
    memberId: text("member_id").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("update_reads_uq").on(t.updateId, t.memberId)],
);

/** A knowledge-check attempt: a library quiz or an update's quiz. */
export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    quiz: text("quiz").notNull(),
    updateId: text("update_id"),
    answers: text("answers", { mode: "json" }).$type<Record<string, number>>().notNull(),
    correct: integer("correct").notNull(),
    total: integer("total").notNull(),
    score: real("score").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    takenAt: integer("taken_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("quiz_member_idx").on(t.memberId, t.quiz), index("quiz_store_idx").on(t.storeId)],
);

/** Guest feedback quotes, naming the staff who looked after them. */
export const guestFeedback = sqliteTable(
  "guest_feedback",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    source: text("source").notNull(),
    guestName: text("guest_name").notNull().default(""),
    rating: integer("rating"),
    quote: text("quote").notNull(),
    receivedOn: text("received_on").notNull(),
    memberIds: text("member_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    memberNames: text("member_names", { mode: "json" }).$type<string[]>().notNull().default([]),
    pinnedOn: text("pinned_on"),
    pinnedByName: text("pinned_by_name"),
    recordedByName: text("recorded_by_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("feedback_store_idx").on(t.storeId, t.receivedOn)],
);

/** A recognition or reward actually given. */
export const rewardAwards = sqliteTable(
  "reward_awards",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    reward: text("reward").notNull(),
    period: text("period").notNull(),
    amount: real("amount"),
    note: text("note").notNull().default(""),
    awardedByName: text("awarded_by_name").notNull(),
    awardedAt: integer("awarded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("reward_awards_uq").on(t.memberId, t.reward, t.period), index("reward_store_idx").on(t.storeId)],
);

export const certifications = sqliteTable(
  "certifications",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    memberId: text("member_id").notNull(),
    kind: text("kind").notNull(),
    issuer: text("issuer").notNull().default(""),
    number: text("number").notNull().default(""),
    issuedOn: text("issued_on").notNull(),
    expiresOn: text("expires_on"),
    recordedByName: text("recorded_by_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("certs_member_idx").on(t.memberId), index("certs_store_idx").on(t.storeId)],
);

/** Manager log book: shift notes, maintenance requests and incident reports. */
export const logEntries = sqliteTable(
  "log_entries",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    businessDate: text("business_date").notNull(),
    shift: text("shift", { enum: ["lunch", "dinner"] }).notNull(),
    kind: text("kind", { enum: ["note", "maintenance", "incident"] }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    photoKey: text("photo_key"),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    authorName: text("author_name").notNull(),
    authorRole: text("author_role").notNull(),
    signature: text("signature"),
    resolvedByName: text("resolved_by_name"),
    resolvedNote: text("resolved_note"),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("log_store_idx").on(t.storeId, t.businessDate)],
);

/** What each person needs from their week, so a slow night is handled fairly. */
export const hourGoals = sqliteTable(
  "hour_goals",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    memberId: text("member_id").notNull(),
    weeklyHours: integer("weekly_hours").notNull().default(32),
    /** Happy to go home first when it's slow. */
    volunteerEarly: integer("volunteer_early", { mode: "boolean" }).notNull().default(false),
    /** Willing to pick up a shift at a sister store. */
    crossStore: integer("cross_store", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("hour_goals_uq").on(t.memberId)],
);

/** A sister store asking for cover — slow-night staff can be redeployed there instead of cut. */
export const coverageCalls = sqliteTable(
  "coverage_calls",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    businessDate: text("business_date").notNull(),
    shift: text("shift", { enum: ["lunch", "dinner"] }).notNull(),
    role: text("role").notNull(),
    hours: real("hours").notNull().default(5),
    note: text("note").notNull().default(""),
    status: text("status", { enum: ["open", "filled"] }).notNull().default("open"),
    filledById: text("filled_by_id"),
    filledByName: text("filled_by_name"),
    postedByName: text("posted_by_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("coverage_org_idx").on(t.orgId, t.businessDate)],
);

/** What happened to someone's hours on a slow night: sent home, or kept earning another way. */
export const slowNightActions = sqliteTable(
  "slow_night_actions",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    businessDate: text("business_date").notNull(),
    shift: text("shift", { enum: ["lunch", "dinner"] }).notNull(),
    memberId: text("member_id").notNull(),
    memberName: text("member_name").notNull(),
    action: text("action", { enum: ["voluntary_out", "cut", "sister_store", "training", "outreach"] }).notNull(),
    hours: real("hours").notNull(),
    toStoreId: text("to_store_id"),
    toStoreName: text("to_store_name"),
    detail: text("detail").notNull().default(""),
    decidedByName: text("decided_by_name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("slow_store_idx").on(t.storeId, t.businessDate), index("slow_member_idx").on(t.memberId)],
);
