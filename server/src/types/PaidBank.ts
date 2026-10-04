// One paid bank: its exact file bytes, verified against the manifest hash, and its store product id.
interface PaidBank {
  body: Buffer;
  productId: string;
}

export type { PaidBank };
