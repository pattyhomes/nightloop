import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { AppConfig } from "../../lib/config";
import { ApiError, asyncHandler, toValidationError } from "../../lib/apiError";
import type { AuthAdminClient } from "../../lib/authAdmin";
import { createAuthMiddleware } from "../../middleware/auth";
import {
  attestAge,
  deleteAccount,
  ensureAccountForAuthUser,
  getPreferences,
  patchProfile,
  patchSettings,
  replacePreferences,
  requireEligible,
  toMeResponse,
  type AccountState,
  REQUIRED_PREFERENCE_CATEGORIES
} from "../../services/v1/accountService";
import { getMarketConfig, listMarkets } from "../../services/v1/marketService";
import { getVenue, listVenues } from "../../services/v1/venueService";
import { listRecommendations } from "../../services/v1/recommendationService";
import { listUserRecentSignals, submitUserSignal } from "../../services/v1/signalService";
import {
  acceptFriendInvite,
  acceptFriendRequest,
  addActivityReply,
  blockUser,
  cancelFriendRequest,
  createFriendInvite,
  declineFriendRequest,
  listBlocks,
  listFriendActivity,
  listFriends,
  reportActivity,
  reportProfile,
  revokeFriendInvite,
  searchProfiles,
  sendFriendRequest,
  toggleComing,
  unblockUser,
  unfriend
} from "../../services/v1/socialService";
import { createAdminRouter } from "./admin";

declare global {
  namespace Express {
    interface Request {
      account?: AccountState;
    }
  }
}

const AgeAttestationSchema = z.object({
  is_21_or_over: z.boolean()
});

const ProfilePatchSchema = z
  .object({
    display_name: z.string().trim().min(1).max(40).optional(),
    username: z.string().regex(/^[a-z0-9_]{3,24}$/).optional(),
    selected_market_id: z.string().uuid().optional(),
    bio: z.string().trim().max(160).nullable().optional()
  })
  .strict();

const SettingsPatchSchema = z
  .object({
    ghost_mode: z.boolean().optional(),
    map_show_neighborhood_labels: z.boolean().optional(),
    map_show_street_grid: z.boolean().optional(),
    push_social_enabled: z.boolean().optional(),
    push_decision_enabled: z.boolean().optional(),
    push_favorite_venue_alerts_enabled: z.boolean().optional()
  })
  .strict();

const PreferenceKeySchema = z.string().trim().regex(/^[a-z0-9_-]{2,40}$/);
const PreferencesSchema = z
  .record(z.string(), z.array(PreferenceKeySchema))
  .superRefine((value, ctx) => {
    for (const category of REQUIRED_PREFERENCE_CATEGORIES) {
      const unique = new Set(value[category] ?? []);
      if (unique.size < 3) {
        ctx.addIssue({
          code: "custom",
          path: [category],
          message: "At least three picks are required."
        });
      }
    }
  });

const VenueQuerySchema = z.object({
  market_id: z.string().min(1),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius_km: z.coerce.number().positive().max(100).optional(),
  pulse: z.enum(["chill", "active", "packed"]).optional(),
  q: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const RecommendationQuerySchema = z.object({
  market_id: z.string().min(1),
  pulse: z.enum(["chill", "active", "packed"]).optional(),
  limit: z.coerce.number().int().positive().max(60).optional()
});

const StructuredTagSchema = z.string().trim().regex(/^[a-z0-9_-]{2,40}$/);
const SignalDetailsSchema = z
  .object({
    wait_minutes: z.coerce.number().int().min(0).max(180).optional(),
    cover_amount_dollars: z.coerce.number().int().min(0).max(500).optional(),
    crowd_level: z.enum(["empty", "chill", "active", "packed"]).optional(),
    vibe_tags: z.array(StructuredTagSchema).max(8).optional(),
    music_tags: z.array(StructuredTagSchema).max(8).optional(),
    event_live: z.boolean().optional()
  })
  .strict();

const SignalSchema = z
  .object({
    venue_id: z.string().uuid(),
    kind: z.enum(["packed", "short_line", "long_line", "dead", "event_live"]),
    location: z
      .object({
        latitude: z.coerce.number().min(-90).max(90),
        longitude: z.coerce.number().min(-180).max(180)
      })
      .optional(),
    observed_at: z.string().datetime().optional(),
    details: SignalDetailsSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

const DevConfirmedAuthUserSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(128)
  })
  .strict();

const RecentSignalsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});

const FriendSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().positive().max(30).optional()
});

const FriendActivityQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional()
});

const UserIdBodySchema = z
  .object({
    user_id: z.string().uuid()
  })
  .strict();

const InviteAcceptSchema = z
  .object({
    code: z.string().trim().min(6).max(40)
  })
  .strict();

const ComingBodySchema = z
  .object({
    is_coming: z.boolean().default(true)
  })
  .strict();

const ActivityReplySchema = z
  .object({
    kind: z.enum(["comment", "emoji_signal"]),
    text: z.string().trim().min(1).max(140).optional(),
    signal_kind: z.enum(["packed", "short_line", "long_line", "dead", "event_live"]).optional(),
    details: z.record(z.string(), z.unknown()).optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind === "comment" && !value.text) {
      ctx.addIssue({
        code: "custom",
        path: ["text"],
        message: "Text is required for comment replies."
      });
    }
    if (value.kind === "emoji_signal" && !value.signal_kind) {
      ctx.addIssue({
        code: "custom",
        path: ["signal_kind"],
        message: "signal_kind is required for emoji signal replies."
      });
    }
  });

const SocialReportSchema = z
  .object({
    reason: z.string().trim().min(2).max(80),
    details: z.record(z.string(), z.unknown()).optional()
  })
  .strict();

function accountFromRequest(req: Request): AccountState {
  if (!req.account) {
    throw new ApiError(500, "ACCOUNT_CONTEXT_MISSING", "Account context is missing.");
  }
  return req.account;
}

function requireEligibleMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    requireEligible(accountFromRequest(req));
    next();
  } catch (error) {
    next(error);
  }
}

function createWriteLimiter(config: AppConfig, limit: number, prefix: string) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${prefix}:${req.auth?.authUserId ?? "anonymous"}`,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again shortly."
        }
      });
    }
  });
}

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

export function createV1Router(config: AppConfig, authAdmin: AuthAdminClient): Router {
  const router = Router();
  const auth = createAuthMiddleware(config);
  const accountWriteLimiter = createWriteLimiter(config, config.accountWriteLimit, "account");
  const signalWriteLimiter = createWriteLimiter(config, config.signalWriteLimit, "signal");

  router.get(
    "/markets",
    asyncHandler(async (_req, res) => {
      res.json(await listMarkets());
    })
  );

  router.get(
    "/markets/:id/config",
    asyncHandler(async (req, res) => {
      res.json(await getMarketConfig(req.params.id));
    })
  );

  router.post(
    "/dev/confirmed-auth-user",
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      if (config.env === "production") {
        throw new ApiError(404, "NOT_FOUND", "Resource not found.");
      }
      if (!authAdmin.createConfirmedEmailUser) {
        throw new ApiError(500, "AUTH_ADMIN_UNAVAILABLE", "Supabase auth admin user creation is unavailable.");
      }

      const body = parseBody(DevConfirmedAuthUserSchema, req.body);
      const user = await authAdmin.createConfirmedEmailUser(body);
      res.status(201).json({
        user,
        message: "Confirmed local development auth user is ready."
      });
    })
  );

  router.use(auth);
  router.use(
    asyncHandler(async (req, _res, next) => {
      if (!req.auth) {
        throw new ApiError(401, "AUTH_REQUIRED", "Authorization bearer token is required.");
      }
      req.account = await ensureAccountForAuthUser(req.auth.authUserId);
      next();
    })
  );

  router.get(
    "/me",
    asyncHandler(async (req, res) => {
      res.json(toMeResponse(accountFromRequest(req)));
    })
  );

  router.post(
    "/me/age-attestation",
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(AgeAttestationSchema, req.body);
      const account = await attestAge(accountFromRequest(req), body.is_21_or_over);
      res.json(toMeResponse(account));
    })
  );

  router.patch(
    "/me/profile",
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(ProfilePatchSchema, req.body);
      const account = await patchProfile(accountFromRequest(req), {
        displayName: body.display_name,
        username: body.username,
        selectedMarketId: body.selected_market_id,
        bio: body.bio
      });
      res.json(toMeResponse(account));
    })
  );

  router.patch(
    "/me/settings",
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(SettingsPatchSchema, req.body);
      const account = await patchSettings(accountFromRequest(req), body);
      res.json(toMeResponse(account));
    })
  );

  router.get(
    "/me/preferences",
    asyncHandler(async (req, res) => {
      res.json({ preferences: await getPreferences(accountFromRequest(req)) });
    })
  );

  router.get(
    "/me/signals",
    asyncHandler(async (req, res) => {
      const query = parseQuery(RecentSignalsQuerySchema, req.query);
      res.json(await listUserRecentSignals({ account: accountFromRequest(req), limit: query.limit }));
    })
  );

  router.put(
    "/me/preferences",
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(PreferencesSchema, req.body);
      const normalized = Object.fromEntries(
        Object.entries(body).map(([category, keys]) => [category, [...new Set(keys)]])
      );
      res.json({ preferences: await replacePreferences(accountFromRequest(req), normalized) });
    })
  );

  router.delete(
    "/me/account",
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      await deleteAccount(accountFromRequest(req), authAdmin);
      res.status(202).json({
        status: "accepted",
        message: "Account deletion has started."
      });
    })
  );

  router.get(
    "/friends",
    requireEligibleMiddleware,
    asyncHandler(async (req, res) => {
      res.json(await listFriends(accountFromRequest(req)));
    })
  );

  router.get(
    "/friends/search",
    requireEligibleMiddleware,
    asyncHandler(async (req, res) => {
      const query = parseQuery(FriendSearchQuerySchema, req.query);
      res.json(await searchProfiles({ account: accountFromRequest(req), q: query.q, limit: query.limit }));
    })
  );

  router.post(
    "/friends/requests",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(UserIdBodySchema, req.body);
      const result = await sendFriendRequest(accountFromRequest(req), body.user_id);
      res.status(result.created ? 201 : 200).json(result);
    })
  );

  router.post(
    "/friends/requests/:id/accept",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      res.json(await acceptFriendRequest(accountFromRequest(req), req.params.id));
    })
  );

  router.post(
    "/friends/requests/:id/decline",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      res.json(await declineFriendRequest(accountFromRequest(req), req.params.id));
    })
  );

  router.delete(
    "/friends/requests/:id",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      res.json(await cancelFriendRequest(accountFromRequest(req), req.params.id));
    })
  );

  router.delete(
    "/friends/:userId",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      res.json(await unfriend(accountFromRequest(req), req.params.userId));
    })
  );

  router.get(
    "/friends/blocks",
    requireEligibleMiddleware,
    asyncHandler(async (req, res) => {
      res.json(await listBlocks(accountFromRequest(req)));
    })
  );

  router.post(
    "/friends/blocks",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(UserIdBodySchema, req.body);
      const result = await blockUser(accountFromRequest(req), body.user_id);
      res.status(201).json(result);
    })
  );

  router.delete(
    "/friends/blocks/:userId",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      res.json(await unblockUser(accountFromRequest(req), req.params.userId));
    })
  );

  router.post(
    "/friends/invites",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      res.status(201).json(await createFriendInvite(accountFromRequest(req)));
    })
  );

  router.delete(
    "/friends/invites/:id",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      res.json(await revokeFriendInvite(accountFromRequest(req), req.params.id));
    })
  );

  router.post(
    "/friends/invites/accept",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(InviteAcceptSchema, req.body);
      res.json(await acceptFriendInvite(accountFromRequest(req), body.code));
    })
  );

  router.get(
    "/friends/activity",
    requireEligibleMiddleware,
    asyncHandler(async (req, res) => {
      const query = parseQuery(FriendActivityQuerySchema, req.query);
      res.json(await listFriendActivity({ account: accountFromRequest(req), limit: query.limit }));
    })
  );

  router.post(
    "/friends/venues/:venueId/coming",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(ComingBodySchema, req.body);
      const result = await toggleComing({
        account: accountFromRequest(req),
        venueId: req.params.venueId,
        isComing: body.is_coming
      });
      res.status(body.is_coming ? 201 : 200).json(result);
    })
  );

  router.post(
    "/friends/activity/:id/replies",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(ActivityReplySchema, req.body);
      res.status(201).json(
        await addActivityReply({
          account: accountFromRequest(req),
          activityId: req.params.id,
          kind: body.kind,
          text: body.text,
          signalKind: body.signal_kind,
          details: body.details
        })
      );
    })
  );

  router.post(
    "/friends/activity/:id/report",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(SocialReportSchema, req.body);
      res.status(201).json(
        await reportActivity({
          account: accountFromRequest(req),
          activityId: req.params.id,
          reason: body.reason,
          details: body.details
        })
      );
    })
  );

  router.post(
    "/friends/profiles/:userId/report",
    requireEligibleMiddleware,
    accountWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(SocialReportSchema, req.body);
      res.status(201).json(
        await reportProfile({
          account: accountFromRequest(req),
          userId: req.params.userId,
          reason: body.reason,
          details: body.details
        })
      );
    })
  );

  router.use("/admin", createAdminRouter(config));

  router.get(
    "/recommendations",
    requireEligibleMiddleware,
    asyncHandler(async (req, res) => {
      const query = parseQuery(RecommendationQuerySchema, req.query);
      res.json(
        await listRecommendations({
          account: accountFromRequest(req),
          marketId: query.market_id,
          pulse: query.pulse,
          limit: query.limit
        })
      );
    })
  );

  router.get(
    "/venues",
    requireEligibleMiddleware,
    asyncHandler(async (req, res) => {
      const query = parseQuery(VenueQuerySchema, req.query);
      res.json(
        await listVenues({
          account: accountFromRequest(req),
          marketId: query.market_id,
          lat: query.lat,
          lng: query.lng,
          radiusKm: query.radius_km,
          pulse: query.pulse,
          q: query.q,
          limit: query.limit
        })
      );
    })
  );

  router.get(
    "/venues/:id",
    requireEligibleMiddleware,
    asyncHandler(async (req, res) => {
      res.json(await getVenue(req.params.id, accountFromRequest(req)));
    })
  );

  router.post(
    "/signals",
    requireEligibleMiddleware,
    signalWriteLimiter,
    asyncHandler(async (req, res) => {
      const body = parseBody(SignalSchema, req.body);
      const result = await submitUserSignal({
        account: accountFromRequest(req),
        venueId: body.venue_id,
        kind: body.kind,
        location: body.location,
        observedAt: body.observed_at,
        metadata: body.metadata,
        details: body.details
      });

      res.status(201).json({
        signal_id: result.signalId,
        venue_id: result.venueId,
        points_awarded: result.pointsAwarded,
        new_signal_scout_points: result.newSignalScoutPoints
      });
    })
  );

  return router;
}
