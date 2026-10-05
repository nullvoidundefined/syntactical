// Request body for PUT /v1/admin/access: a paid product id, matched exactly, and whether the
// admin should have access. Unknown fields (a userId, an isAdmin) are refused.
import { z } from 'zod';

function createAdminSchemas(paidProductIds: ReadonlySet<string>) {
  return {
    updateAccess: z
      .object({
        isGranted: z.boolean(),
        productId: z.string().refine((productId) => paidProductIds.has(productId)),
      })
      .strict(),
  };
}

export { createAdminSchemas };
