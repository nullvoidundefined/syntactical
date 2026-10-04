// Whether a Content-Type header value names application/json, ignoring parameters (a charset)
// and letter case. Shared by the JSON-only guards so they read the header the same way.
const JSON_MEDIA_TYPE = 'application/json';

function isJsonMediaType(contentType: string | undefined): boolean {
  const [mediaType = ''] = (contentType ?? '').split(';');
  return mediaType.trim().toLowerCase() === JSON_MEDIA_TYPE;
}

export { isJsonMediaType };
