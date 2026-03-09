const express = require('express');
const { ZodError } = require('zod');
const { sendError } = require('../lib/errors');
const { listVenues, getVenueById } = require('../db/venues');
const {
  venuesQuerySchema,
  venueIdParamSchema,
  venuesListResponseSchema,
  venueDetailResponseSchema,
} = require('../contracts/venues');

function getValidationIssue(error) {
  if (!(error instanceof ZodError) || error.issues.length === 0) {
    return null;
  }

  const issue = error.issues[0];
  return {
    field: issue.path.join('.') || 'request',
    reason: issue.message,
  };
}

function buildVenuesRouter({ pool }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    let query;
    try {
      query = venuesQuerySchema.parse(req.query);
    } catch (error) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid venue query parameters', getValidationIssue(error));
    }

    try {
      const response = await listVenues(pool, query);
      const parsed = venuesListResponseSchema.parse(response);
      return res.json(parsed);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    let params;
    try {
      params = venueIdParamSchema.parse(req.params);
    } catch (error) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid venue id', getValidationIssue(error));
    }

    try {
      const venue = await getVenueById(pool, params.id);
      if (!venue) {
        return sendError(res, 404, 'NOT_FOUND', 'Venue not found', { id: params.id });
      }

      const parsed = venueDetailResponseSchema.parse(venue);
      return res.json(parsed);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  buildVenuesRouter,
};
