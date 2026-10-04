// The tail of the purchaser call queue: each call runs after the one before it.
export const purchaserQueue: { tail: Promise<void> } = { tail: Promise.resolve() };
