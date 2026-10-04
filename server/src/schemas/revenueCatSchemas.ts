// The shape of a RevenueCat webhook body; fields beyond these are kept but not checked here.
import { z } from 'zod';

import { WEBHOOKS } from '../constants/webhooks.js';

const revenueCatSchemas = {
  webhook: z.object({
    event: z.looseObject({
      app_user_id: z.string().max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      event_timestamp_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      id: z.string().min(1).max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      product_id: z.string().min(1).max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      store: z.string().min(1).max(WEBHOOKS.MAX_EVENT_ID_LENGTH),
      type: z.string().min(1),
    }),
  }),
};

export { revenueCatSchemas };
