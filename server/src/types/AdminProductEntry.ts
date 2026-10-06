// One paid product as the admin access routes report it: whether the admin has access now and
// the source of that access (null when not granted).
interface AdminProductEntry {
  grantSource: 'admin' | 'purchase' | null;
  isGranted: boolean;
  productId: string;
}

export type { AdminProductEntry };
