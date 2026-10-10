import { sqliteTable, text, integer, index, blob } from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

/**
 * An invitation to join a group. The invited person gets a set password link; the account is
 * linked to the roster entry or leadership access only once that link is used.
 */
export const invites = sqliteTable(
  "invites",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    userId: text("user_id").notNull(),
    memberId: text("member_id"),
    accessId: text("access_id"),
    /** The better auth reset token this invite rides on. */
    token: text("token").notNull(),
    createdBy: text("created_by").notNull(),
    createdByName: text("created_by_name").notNull(),
    emailed: integer("emailed", { mode: "boolean" }).notNull().default(false),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("invites_user_idx").on(t.userId), index("invites_org_idx").on(t.orgId)],
);

/** Terms of service and privacy policy acceptance, one row per document and version. */
export const legalAcceptances = sqliteTable(
  "legal_acceptances",
  {
    id: id(),
    userId: text("user_id").notNull(),
    doc: text("doc", { enum: ["terms", "privacy"] }).notNull(),
    version: text("version").notNull(),
    ip: text("ip"),
    acceptedAt: createdAt(),
  },
  (t) => [index("legal_user_idx").on(t.userId)],
);

/** A pending second step to open private records: password checked, code texted. */
export const privacyChallenges = sqliteTable("privacy_challenges", {
  id: id(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  orgId: text("org_id").notNull(),
  codeHash: text("code_hash"),
  phoneLast4: text("phone_last4"),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: createdAt(),
});

/** Private records are open for this sign in until expiresAt. */
export const privacyUnlocks = sqliteTable(
  "privacy_unlocks",
  {
    id: id(),
    userId: text("user_id").notNull(),
    sessionId: text("session_id").notNull(),
    orgId: text("org_id").notNull(),
    method: text("method").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("privacy_unlocks_session_idx").on(t.sessionId)],
);

/** Every opening of a private record, for the owner to read. */
export const privacyLog = sqliteTable(
  "privacy_log",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    userId: text("user_id"),
    name: text("name").notNull(),
    role: text("role").notNull(),
    /** unlock | refused | conduct | contact | pay | reviews | export | backup | phone */
    area: text("area").notNull(),
    subjectId: text("subject_id"),
    detail: text("detail").notNull().default(""),
    ip: text("ip"),
    at: createdAt(),
  },
  (t) => [index("privacy_log_org_idx").on(t.orgId, t.at)],
);

/** Phone numbers for codes, for leadership accounts that have no roster entry. */
export const securityPhones = sqliteTable("security_phones", {
  userId: text("user_id").primaryKey(),
  phone: text("phone").notNull(),
  updatedAt: createdAt(),
});

/** One encrypted backup of a group's records. */
export const backups = sqliteTable(
  "backups",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    kind: text("kind", { enum: ["nightly", "manual"] }).notNull(),
    /** s3 | database */
    storage: text("storage").notNull(),
    key: text("key"),
    /** Encrypted bytes when kept in the database. */
    data: blob("data", { mode: "buffer" }),
    bytes: integer("bytes").notNull().default(0),
    rows: integer("rows").notNull().default(0),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    error: text("error"),
    forDate: text("for_date").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("backups_org_idx").on(t.orgId, t.createdAt)],
);

/** How a store's nightly POS figures reach the platform. */
export const posConnections = sqliteTable(
  "pos_connections",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    system: text("system").notNull(),
    /** toast_sftp | square_api | clover_api | email | csv */
    method: text("method").notNull(),
    settings: text("settings", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
    /** Address the POS mails its nightly report to. */
    inboundKey: text("inbound_key").notNull(),
    pullAt: text("pull_at").notNull().default("05:00"),
    status: text("status", { enum: ["setup", "live", "paused"] }).notNull().default("setup"),
    lastImportAt: integer("last_import_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [index("pos_connections_store_idx").on(t.storeId)],
);

/** One night's import attempt. */
export const posImports = sqliteTable(
  "pos_imports",
  {
    id: id(),
    orgId: text("org_id").notNull(),
    storeId: text("store_id").notNull(),
    connectionId: text("connection_id"),
    businessDate: text("business_date").notNull(),
    source: text("source").notNull(),
    status: text("status", { enum: ["ok", "partial", "failed", "missing"] }).notNull(),
    rows: integer("rows").notNull().default(0),
    message: text("message").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("pos_imports_store_idx").on(t.storeId, t.businessDate)],
);
