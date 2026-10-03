// An item id becomes a review-file heading, so it must be a plain slug.
const SAFE_ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isSafeItemId(id: unknown): id is string {
    return typeof id === 'string' && SAFE_ITEM_ID.test(id);
}
