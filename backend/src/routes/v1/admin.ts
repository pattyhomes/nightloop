import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { ApiError, asyncHandler, toValidationError } from "../../lib/apiError";
import type { AppConfig } from "../../lib/config";
import {
  approveVenueReviewItem,
  bootstrapLocalAdmin,
  createProviderImportRun,
  createVenueAsset,
  getAdminForAuthUser,
  getReviewerAccountStatus,
  importEvents,
  listAdminVenues,
  listModerationReports,
  listProviderImportRuns,
  listProviderRecords,
  listVenueAssets,
  listVenueReviewItems,
  patchModerationReport,
  patchVenueAsset,
  rejectVenueReviewItem,
  runProviderImportRun,
  seedReviewerAccount,
  type AdminActor,
  type AdminUser
} from "../../services/v1/adminService";
import type { AccountState } from "../../services/v1/accountService";

declare global {
  namespace Express {
    interface Request {
      adminUser?: AdminUser;
    }
  }
}

const ProviderSchema = z.enum(["foursquare", "google_places", "resident_advisor", "manual", "datasf_poe"]);
const ProviderModeSchema = z.enum(["fixture", "dry_run", "live"]);

const CreateProviderRunSchema = z
  .object({
    provider: ProviderSchema,
    market_id: z.string().uuid(),
    mode: ProviderModeSchema.default("dry_run"),
    capped_venue_count: z.coerce.number().int().min(1).max(100).default(20),
    summary: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const ProviderRecordQuerySchema = z.object({
  import_run_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const ReviewQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  import_run_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const ReviewApproveSchema = z
  .object({
    note: z.string().trim().max(300).optional()
  })
  .strict();

const ReviewRejectSchema = z
  .object({
    reason: z.string().trim().min(3).max(300)
  })
  .strict();

const AssetCreateSchema = z
  .object({
    venue_id: z.string().uuid(),
    asset_type: z.literal("image").default("image"),
    url: z.string().url(),
    alt_text: z.string().trim().max(240).optional(),
    credit_text: z.string().trim().min(1).max(160),
    credit_url: z.string().url().optional(),
    license_name: z.string().trim().min(1).max(160),
    license_url: z.string().url().optional(),
    rights_status: z.enum(["licensed", "owned", "partner", "public_domain"]),
    source: z.string().trim().min(1).max(80).default("manual"),
    is_approved: z.boolean().default(false),
    sort_order: z.coerce.number().int().min(0).max(1000).optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const AssetPatchSchema = z
  .object({
    alt_text: z.string().trim().max(240).nullable().optional(),
    credit_text: z.string().trim().min(1).max(160).optional(),
    credit_url: z.string().url().nullable().optional(),
    license_name: z.string().trim().min(1).max(160).optional(),
    license_url: z.string().url().nullable().optional(),
    rights_status: z.enum(["licensed", "owned", "partner", "public_domain"]).optional(),
    is_approved: z.boolean().optional(),
    sort_order: z.coerce.number().int().min(0).max(1000).optional()
  })
  .strict();

const EventImportSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            venue_id: z.string().uuid(),
            title: z.string().trim().min(1).max(120),
            starts_at: z.string().datetime(),
            ends_at: z.string().datetime().nullable().optional(),
            source: z.enum(["manual", "foursquare", "google_places", "resident_advisor", "eventbrite", "venue_website"]).default("manual"),
            source_event_id: z.string().trim().min(1).max(160).nullable().optional(),
            url: z.string().url().nullable().optional(),
            is_approved: z.boolean().default(false),
            metadata: z.record(z.string(), z.unknown()).optional()
          })
          .strict()
      )
      .min(1)
      .max(50)
  })
  .strict();

const ModerationQuerySchema = z.object({
  status: z.enum(["open", "reviewing", "resolved", "dismissed"]).optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const ModerationPatchSchema = z
  .object({
    status: z.enum(["open", "reviewing", "resolved", "dismissed"])
  })
  .strict();

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw toValidationError(result.error);
  }
  return result.data;
}

function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw toValidationError(result.error);
  }
  return result.data;
}

function getAccount(req: Request): AccountState {
  if (!req.account) {
    throw new ApiError(500, "ACCOUNT_CONTEXT_MISSING", "Account context is missing.");
  }
  return req.account;
}

function getActor(req: Request): AdminActor {
  const account = getAccount(req);
  const admin = req.adminUser;
  if (!admin) {
    throw new ApiError(403, "ADMIN_REQUIRED", "An active admin allowlist entry is required.");
  }

  return {
    authUserId: account.user.auth_user_id,
    userId: account.user.id,
    role: admin.role
  };
}

async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const account = getAccount(req);
    const admin = await getAdminForAuthUser(account.user.auth_user_id);
    if (!admin) {
      throw new ApiError(403, "ADMIN_REQUIRED", "An active admin allowlist entry is required.");
    }

    req.adminUser = admin;
    next();
  } catch (error) {
    next(error);
  }
}

export function createAdminRouter(config: AppConfig): Router {
  const router = Router();
  const adminWriteLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.accountWriteLimit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `admin:${req.auth?.authUserId ?? "anonymous"}`,
    skip: (req) => !["POST", "PATCH", "DELETE"].includes(req.method),
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many admin write requests. Please try again shortly."
        }
      });
    }
  });

  router.post(
    "/bootstrap-local",
    adminWriteLimiter,
    asyncHandler(async (req, res) => {
      if (config.env === "production") {
        throw new ApiError(404, "NOT_FOUND", "Resource not found.");
      }

      const account = getAccount(req);
      const admin = await bootstrapLocalAdmin(account.user.auth_user_id);
      req.adminUser = admin;
      res.status(201).json({ admin, user: account.user });
    })
  );

  router.use(requireAdmin);
  router.use(adminWriteLimiter);

  router.get(
    "/me",
    asyncHandler(async (req, res) => {
      res.json({
        admin: req.adminUser,
        user: getAccount(req).user
      });
    })
  );

  router.get(
    "/venues",
    asyncHandler(async (req, res) => {
      const query = parseQuery(
        z.object({
          market_id: z.string().uuid().optional(),
          q: z.string().trim().min(1).max(80).optional(),
          limit: z.coerce.number().int().positive().max(200).optional()
        }),
        req.query
      );
      res.json(await listAdminVenues({ marketId: query.market_id, q: query.q, limit: query.limit }));
    })
  );

  router.get(
    "/provider-import-runs",
    asyncHandler(async (req, res) => {
      const query = parseQuery(z.object({ limit: z.coerce.number().int().positive().max(100).optional() }), req.query);
      res.json(await listProviderImportRuns(query.limit));
    })
  );

  router.post(
    "/provider-import-runs",
    asyncHandler(async (req, res) => {
      const body = parseBody(CreateProviderRunSchema, req.body);
      const result = await createProviderImportRun({
        provider: body.provider,
        marketId: body.market_id,
        mode: body.mode,
        cappedVenueCount: body.capped_venue_count,
        summary: body.summary,
        actor: getActor(req)
      });
      res.status(201).json(result);
    })
  );

  router.post(
    "/provider-import-runs/:id/run",
    asyncHandler(async (req, res) => {
      res.json(
        await runProviderImportRun({
          config,
          runId: req.params.id,
          actor: getActor(req)
        })
      );
    })
  );

  router.get(
    "/provider-records",
    asyncHandler(async (req, res) => {
      const query = parseQuery(ProviderRecordQuerySchema, req.query);
      res.json(await listProviderRecords({ importRunId: query.import_run_id, limit: query.limit }));
    })
  );

  router.get(
    "/venue-review-items",
    asyncHandler(async (req, res) => {
      const query = parseQuery(ReviewQuerySchema, req.query);
      res.json(
        await listVenueReviewItems({
          status: query.status,
          importRunId: query.import_run_id,
          limit: query.limit
        })
      );
    })
  );

  router.post(
    "/venue-review-items/:id/approve",
    asyncHandler(async (req, res) => {
      const body = parseBody(ReviewApproveSchema, req.body);
      res.json(
        await approveVenueReviewItem({
          reviewItemId: req.params.id,
          note: body.note,
          actor: getActor(req)
        })
      );
    })
  );

  router.post(
    "/venue-review-items/:id/reject",
    asyncHandler(async (req, res) => {
      const body = parseBody(ReviewRejectSchema, req.body);
      res.json(
        await rejectVenueReviewItem({
          reviewItemId: req.params.id,
          reason: body.reason,
          actor: getActor(req)
        })
      );
    })
  );

  router.get(
    "/venue-assets",
    asyncHandler(async (req, res) => {
      const query = parseQuery(
        z.object({
          venue_id: z.string().uuid().optional(),
          limit: z.coerce.number().int().positive().max(100).optional()
        }),
        req.query
      );
      res.json(await listVenueAssets({ venueId: query.venue_id, limit: query.limit }));
    })
  );

  router.post(
    "/venue-assets",
    asyncHandler(async (req, res) => {
      const body = parseBody(AssetCreateSchema, req.body);
      const result = await createVenueAsset({
        venueId: body.venue_id,
        assetType: body.asset_type,
        url: body.url,
        altText: body.alt_text,
        creditText: body.credit_text,
        creditUrl: body.credit_url,
        licenseName: body.license_name,
        licenseUrl: body.license_url,
        rightsStatus: body.rights_status,
        source: body.source,
        isApproved: body.is_approved,
        sortOrder: body.sort_order,
        metadata: body.metadata,
        actor: getActor(req)
      });
      res.status(201).json(result);
    })
  );

  router.patch(
    "/venue-assets/:id",
    asyncHandler(async (req, res) => {
      const body = parseBody(AssetPatchSchema, req.body);
      res.json(
        await patchVenueAsset({
          assetId: req.params.id,
          patch: {
            altText: body.alt_text,
            creditText: body.credit_text,
            creditUrl: body.credit_url,
            licenseName: body.license_name,
            licenseUrl: body.license_url,
            rightsStatus: body.rights_status,
            isApproved: body.is_approved,
            sortOrder: body.sort_order
          },
          actor: getActor(req)
        })
      );
    })
  );

  router.post(
    "/events/import",
    asyncHandler(async (req, res) => {
      const body = parseBody(EventImportSchema, req.body);
      res.json(
        await importEvents({
          events: body.events.map((event) => ({
            venueId: event.venue_id,
            title: event.title,
            startsAt: event.starts_at,
            endsAt: event.ends_at,
            source: event.source,
            sourceEventId: event.source_event_id,
            url: event.url,
            isApproved: event.is_approved,
            metadata: event.metadata
          })),
          actor: getActor(req)
        })
      );
    })
  );

  router.get(
    "/moderation-reports",
    asyncHandler(async (req, res) => {
      const query = parseQuery(ModerationQuerySchema, req.query);
      res.json(await listModerationReports({ status: query.status, limit: query.limit }));
    })
  );

  router.patch(
    "/moderation-reports/:id",
    asyncHandler(async (req, res) => {
      const body = parseBody(ModerationPatchSchema, req.body);
      res.json(
        await patchModerationReport({
          reportId: req.params.id,
          status: body.status,
          actor: getActor(req)
        })
      );
    })
  );

  router.get(
    "/reviewer-account/status",
    asyncHandler(async (_req, res) => {
      res.json(await getReviewerAccountStatus(config));
    })
  );

  router.post(
    "/reviewer-account/seed",
    asyncHandler(async (req, res) => {
      res.json(await seedReviewerAccount(config, getActor(req)));
    })
  );

  return router;
}
