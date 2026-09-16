# Media hosting — the `MediaHost` contract

**Proposed by:** Yash (`features/social/`)
**Implementation owner:** Sunny (server-side)
**Status:** interface exists and is unimplemented. Nothing uploads today.
**Written:** 2026-09-11

> This is a request for a server-side implementation, not a design for one. The
> interface is already in the app at `features/social/media/host.ts`, with an
> `unconfiguredMediaHost` that honestly reports `not_connected`. Everything
> downstream — the composer, the publisher, the tests — is written against it.
> Installing a real one is a one-line `setMediaHost(...)` call.

---

## 1. Why this has to exist at all

Neither platform Shoogle publishes images to will accept an upload from the
phone.

| Platform | How media reaches it | Source |
|---|---|---|
| **Instagram** | *"We cURL media used in publishing attempts, so the media must be hosted on a publicly accessible server at the time of the attempt."* **No binary path for images.** | [content-publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) |
| **Google Business** | `sourceUrl` is the **only** supported media field on a local post. | `docs/research/google-business-profile.md` §6 |
| **Facebook Page** | Accepts `multipart/form-data` **or** a `url` — the one exception | `docs/research/meta-facebook-pages.md` §2 |

So between "the owner picked a photo" and "a platform published it" there has to
be a server holding bytes at a public https URL. There is no way around it and
no app-side substitute.

---

## 2. The interface

```ts
interface MediaHost {
  readonly id: string;
  readonly displayName: string;
  isConfigured(): boolean;
  publish(prepared: PreparedMedia): Result<PublishableMedia>;
  revoke(handle: string): Result<void>;
}
```

**`publish` takes `PreparedMedia`, not a raw file.** By the time it is called,
format, dimensions and byte size have already been settled against *one
platform's* spec by `features/social/media/prepare.ts`. The host does not
inspect, convert or validate — it stores bytes and returns a URL. If a host ever
needs to know what Instagram wants, something upstream has gone wrong.

**`publish` must return a real https URL.** It cannot do otherwise:
`mintPublishableMedia` is the only way to construct the return value and it
rejects anything that is not `https://`. A buggy implementation returning a
`file://` path gets `null`, not a false success.

**`revoke` is not optional.** Hosting happens *before* publishing, so an
abandoned post or a failed publish leaves bytes nobody will ever look at.
Without revocation the bucket grows forever and a customer's photos outlive the
post they were for — a privacy problem as much as a billing one.

---

## 3. What an implementation must guarantee

1. **Publicly fetchable, no auth.** Meta's and Google's servers will `GET` the
   URL with no credentials. A signed URL is fine if it is valid at publish time;
   see §4 on lifetime.
2. **HTTPS.** Meta fetches over TLS. A plaintext URL that happens to work today
   is not something to encode.
3. **Correct `Content-Type`.** Serve `image/jpeg` for a JPEG. A generic
   `application/octet-stream` is a plausible way to have media rejected.
4. **Stable for the life of the attempt.** Instagram containers are valid for
   **24 hours**, and a scheduled post may be hosted well before it publishes.
5. **Byte-exact.** No server-side re-encoding, resizing or stripping. The
   artifact was prepared to satisfy a documented spec; changing it silently
   invalidates that work.
6. **One artifact per platform.** The same photo prepared for Instagram (JPEG,
   ≤1440 px, 4:5–1.91:1) and for Facebook (PNG accepted, ≤10 MB) are *different
   files*. `hostForPlatform` already refuses to upload an artifact whose
   `preparedFor` does not match the target.

---

## 4. Open questions for Sunny

These are decisions I should not make alone, because they are storage and cost
decisions rather than app ones.

- **Public bucket or signed URLs?** Signed is tidier but the signature must
  outlive the schedule horizon — up to 30 days for a Facebook post. A URL that
  expires between scheduling and publishing produces exactly the failure this
  whole architecture exists to prevent.
- **Retention.** When is media deleted? On publish success, on post deletion, on
  a TTL? A published Instagram post does **not** need Shoogle's copy afterwards —
  Meta has its own — so deleting on confirmed success is probably right and
  would keep the bucket small.
- **Size limits and abuse.** Instagram takes 8 MB images and 300 MB video.
  Uncapped upload from an unauthenticated app is not acceptable.
- **Per-business isolation.** Media is customer content. RLS or path scoping
  should make one business's media unreadable by another's session, even though
  the delivery URL itself is public.
- **Who calls `publish`?** Today the app would, at publish time. Once the
  server-side runner exists, the runner should — the phone may be off when a
  scheduled post goes out.

---

## 5. What I need to change when it lands

Nothing structural. `setMediaHost(realHost)` at the app's entry point, and the
composer's "this cannot go out yet" notice stops applying. The publisher already
prepares and hosts per target, and already records a media failure against that
target alone.

---

## 6. What this proposal does NOT do

No Supabase code, no schema, no migration, no bucket configuration, and no
assumption that Supabase is the answer. The interface is storage-agnostic —
S3, R2, Supabase Storage or anything else satisfies it. Those choices are
Sunny's to make.
