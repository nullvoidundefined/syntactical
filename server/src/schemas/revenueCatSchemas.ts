// The shapes of a RevenueCat webhook body: the event type alone, read first, and the full event a handled type must carry. Fields beyond these are kept but not checked here.
import { z } from 'zod';

import { WEBHOOKS } from '../constants/webhooks.js';

const revenueCatSchemas = {
  // Read first: only the event type, so an unhandled type is answered without the full shape.
  eventType: z.object({
    event: z.looseObject({
      type: z.string().min(1),
    }),
  }),
  // A TRANSFER: RevenueCat moved purchases from the transferred_from app user ids to transferred_to.
  // It names no product and no app_user_id.
  transfer: z.object({
    event: z.looseObject({
      event_timestamp_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      id: z.string().min(1).max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      transferred_from: z.array(z.string().max(WEBHOOKS.MAX_EVENT_ID_LENGTH)).min(1).max(WEBHOOKS.MAX_TRANSFER_IDS),
      transferred_to: z.array(z.string().max(WEBHOOKS.MAX_EVENT_ID_LENGTH)).min(1).max(WEBHOOKS.MAX_TRANSFER_IDS),
      type: z.literal('TRANSFER'),
    }),
  }),
  webhook: z.object({
    event: z.looseObject({
      app_user_id: z.string().max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      event_timestamp_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      // The end of the current subscription period; null (or absent) for a non-renewing product.
      expiration_at_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullish(),
      id: z.string().min(1).max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      product_id: z.string().min(1).max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      store: z.string().min(1).max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      type: z.string().min(1),
    }),
  }),
};

export { revenueCatSchemas };
