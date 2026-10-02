## Security review

- reviewer: security-reviewer subagent
- model: claude-fable-5-1
- range: 4b0ffb24b8c7c745ec9a2dc0b045f0c6a7d3e703..6e8dee9b367db4a2d217f9496a5a8f122fcf483a
- artefact: docs/security-reviews/ian-564-pr1.md

| # | Severity | Control | Source | Worst value tried | Evidence | Fix | Status |
|---|---|---|---|---|---|---|---|
| 1 | LOW | Body size limit in `fetchContentText` | Response body with no `content-length` header | A multi-megabyte body served without `content-length` | `clients/fetchContentText.ts:50-53` reads the whole body with `response.text()` before `countUtf8Bytes` compares it to `maxBytes`, so an oversized body is buffered in memory before rejection; the timer at `clients/fetchContentText.ts:57-69` bounds the wait but not the bytes | Read the body as a stream and abort once the running byte count passes `maxBytes`, falling back to the current path only where `response.body` is unavailable | `waived by owner 2026-10-02` |

Nothing found: build-time base path allowlist (`app.config.ts:11-16`, `ALLOWED_BASE_URLS.includes`): sources `EXPO_BASE_URL` environment variable, the code default `/syntactical`: tried unset, `''`, `syntactical`, `/Syntactical`, `/syntactical/`, `/syntactical/../x`, `/syntactical/preview/../x`, `@evil.example`, `.evil.example`, `:8443/x`

Nothing found: runtime content base URL gate (`services/content/validateContentBaseUrl.ts:17-31`, `app/_layout.tsx:18-24`): sources `Constants.expoConfig.extra.contentBaseUrl`, absence of that field: tried `undefined`, `null`, `''`, `42`, `not a url`, `http://` on the pinned host, `https://evil.example/syntactical/content/`, `https://nullvoidundefined.github.io.evil.example/...`, `/other/content/`, the content path without its trailing slash, `https://user@nullvoidundefined.github.io/...`, explicit `:443`, trailing `?x=1#y`

Nothing found: bank path rule and base containment (`services/content/isSafeBankPath.ts:3-6`, `services/content/resolveBankUrl.ts:6-12`, `services/content/validateManifest.ts:21-25`, `scripts/buildContentManifest.mjs:30-38`): sources manifest `path` from the fetched manifest, the cached manifest, the bundled manifest, the repository manifest at build: tried `''`, `../easy.json`, `python/../../secrets.json`, `./python/easy.json`, `%2e%2e/easy.json`, `python/%2E%2E/%2E%2E/easy.json`, `python%2feasy.json`, `python\easy.json`, `..\..\easy.json`, `/python/easy.json`, `/etc/hosts.json`, `https://evil.example/python/easy.json`, `//evil.example/python/easy.json`, `javascript:alert(1).json`, `data:application/json,{}.json`, `python/easy.JSON`, `Python/easy.json`, `python//easy.json`, `?v=1`, `#top`, leading whitespace, `.json`

Nothing found: redirect refusal and response URL check (`clients/fetchContentText.ts:16-33`, `:47`): sources `response.redirected`, `response.url`, the fetch `init`: tried `redirected: true`, a `url` on another path, `url: ''`, `url` on port `8443`, an equivalent `:443` form, an unparsable `url`, a 404 status

Nothing found: declared and measured size limits (`clients/fetchContentText.ts:35-40`, `:50-53`, `services/content/validateQuestionBank.ts:101-103`, `scripts/buildContentManifest.mjs:33-35`, `:122-124`): sources `content-length` header, response body bytes, `CONTENT_LIMITS`, the `questions` array length, bank and manifest files at build: tried `content-length: 2048` against 1024, a missing header with an oversized body, a body exactly at the limit, a manifest over 64 KB, a bank over 512 KB, 501 questions

Nothing found: request timeout (`clients/fetchContentText.ts:57-69`, `:81`): sources `options.timeoutMs`, `CONTENT_LIMITS.fetchTimeoutMs`: tried headers that never arrive, a body that never finishes, `timeoutMs: 0`

Nothing found: manifest validation (`services/content/validateManifest.ts:21-70`): sources the fetched `manifest.json` body, the AsyncStorage manifest entry, the bundled manifest: tried `null`, `undefined`, string, number, array roots, `schemaVersion` missing/`2`/`0`/`1.5`/`'1'`/`null`, `languages` missing/`[]`/object/string, ids `''`/`Python`/`py:thon`/`py/thon`/33 chars/duplicate, display fields empty/121 chars/non-string/markup, `grammar` `cobol`/`Python`/`''`, `banks` `{}`/`null`/array, difficulty keys `expert`/`Easy`/`''`, hashes `''`/63/65 chars/uppercase/non-hex, truncated JSON, non-JSON body

Nothing found: question bank validation (`services/content/validateQuestionBank.ts:16-107`): sources the fetched bank body, the AsyncStorage bank entry, the bundled bank JSON, repository banks at build: tried root `null`/string/array, `schemaVersion` `2`, 501 questions, zero valid questions, ids `''`/`Q-2`/65 chars/duplicate, prompt `''`/2001 chars, query `null`, explanation 4001 chars, tags 11 items/41 chars, code `null`/4001 chars, type `text`/`MC`, choices 1/5 items/empty, `answerIndex` `-1`/length/`1.5`/`NaN`, `answer` `'true'`/`1`/`null`, markup kept as data

Nothing found: bank hash verification and cache gating (`services/content/verifyBankHash.ts:13-15`, `services/content/loadQuestionBank.ts:55-70`, `services/content/readCachedBank.ts:23`): sources manifest `hash`, downloaded body text, the hasher output, `isHashCurrent`, the AsyncStorage hash field: tried stale bytes, a one-character change, uppercase hasher output, a truncated hash, an empty expected hash, multi-byte text, a hash no longer current, a malformed cached hash

Nothing found: own-key lookup of language and difficulty (`services/content/findBankEntry.ts:13`, `state/ContentProvider.tsx:34`, `services/content/buildBankCacheKey.ts:5`): sources route parameters `language` and `difficulty`, manifest ids: tried `constructor`, `toString`, `__proto__` as difficulty and language
