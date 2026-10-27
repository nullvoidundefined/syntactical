// Request body for PUT /v1/admin/access: whether the admin should have Pro through an 'admin'
// grant on the lifetime product. Unknown fields (a productId, a userId, an isAdmin) are refused.
import { z } from 'zod';

const adminSchemas = {
  updateAccess: z.object({ isGranted: z.boolean() }).strict(),
};

export { adminSchemas };
