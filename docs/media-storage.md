# Media Storage

How KDIGI CMS stores, transforms and serves uploaded files: local disk by default, optional Cloudflare R2 per site.

In this doc, "site" means a document of the Sites collection, which is the multi-site boundary; code and fields call it `tenant` (for example `media.tenant`, the `payload-tenant` cookie).

## Storage modes

The Media collection (`src/collections/media.ts`) is backed by Payload's cloud-storage plugin with one hybrid adapter (`src/lib/r2-storage-adapter.ts`, registered as `mediaStoragePlugin` in `src/payload.config.ts`). The adapter decides **per upload, per site**:

| Condition | Backend |
| --- | --- |
| The owning site has `Sites.r2.bucket` and `Sites.r2.accountId` set, and `R2_OFF` is not `true` | Cloudflare R2 (S3 API) |
| Anything else (no R2 config, or `R2_OFF=true`) | Local disk |

A fresh install therefore needs no object storage. Different sites on the same install can use different backends.

| Env var | Default | Meaning |
| --- | --- | --- |
| `MEDIA_DIR` | `./media` (relative to the process working directory) | Root directory for locally stored files. In the Docker image the directory is `/app/media` |
| `R2_OFF` | unset | Set to `true` to force local disk even for sites that have R2 configured (for example, running a dev copy of production data) |
| `PAYLOAD_PUBLIC_SERVER_URL` | `http://localhost:3000` | Public origin of the CMS. Local-disk file URLs are built from it at upload time |

There are **no global R2 env vars**. Bucket, account and credentials are stored on each site (see below). See [configuration.md](configuration.md) for the full env reference and [deploy.md](deploy.md) for the media volume.

## Local disk (default)

Implementation: `src/lib/storage/local-media.ts`.

- Layout: `<MEDIA_DIR>/<siteId>/<filename>`. Uploads that belong to no site go to `<MEDIA_DIR>/shared/`.
- `<filename>` is the uploaded name slugified (diacritics removed, lowercased, everything except `[a-z0-9-]` collapsed to `-`, extension kept). Media folders are a library-organization feature and are **not** part of the on-disk path.
- The same filename in the same site overwrites the existing file. Rename the file or use another site if you need both versions.
- Stored `url`: `<PAYLOAD_PUBLIC_SERVER_URL>/api/media/file/<filename>?t=<siteId>` (no `?t=` for `shared`). This is Payload's built-in media file route; the adapter's `staticHandler` answers it from disk.
- Access: whatever the Media collection's `read` access allows (public read, since media URLs are embedded in published content). Payload evaluates it before the handler runs.
- Deleting a media document deletes its file, but only when the tenant in the URL matches the document's own site.
- Path safety: site keys and filenames are validated against strict patterns and the resolved path must stay inside `MEDIA_DIR`.

Response headers for local files:

| Header | Value |
| --- | --- |
| `Cache-Control` | `public, max-age=3600` |
| `ETag` | Weak ETag from size + mtime; matching `If-None-Match` returns 304 |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Type` | From an allow-list of extensions (images, `pdf`, `mp4`/`webm`/`mov`, `mp3`/`wav`/`ogg`, `txt`, `csv`, `json`, `zip`); anything else is sent as `application/octet-stream` with `Content-Disposition: attachment` |
| `Content-Security-Policy` | `default-src 'none'; style-src 'unsafe-inline'; sandbox` on SVG files |

What does **not** apply to local-disk sites: WebP-on-upload (the toggle lives under `Sites.r2`) and the "Fetch R2" reconcile endpoint. The image editor works on both backends.

## Cloudflare R2 (optional, per site)

Configure it on the site: **Sites > Hệ thống (System) tab > Cloudflare R2 (Storage)** (the `r2` group on the Sites collection). Only super-admins can edit the group. The two credential fields (`accessKeyId`, `secretAccessKey`) have `read: false` access and are never returned by REST or GraphQL; the other `r2` fields are ordinary site data.

| Field | Meaning |
| --- | --- |
| `r2.bucket` | Bucket name |
| `r2.accountId` | Cloudflare account ID. The endpoint is `https://<accountId>.r2.cloudflarestorage.com`. Required: R2 is only used when both `bucket` and `accountId` are set |
| `r2.publicBaseUrl` | Public CDN base URL for the bucket, for example `https://cdn.example.com` |
| `r2.accessKeyId`, `r2.secretAccessKey` | Per-bucket API token. Write-only: edited through the secret fields in the admin, which call `POST /api/sites/:id/secret` (the value is never read back) |
| `r2.compressToWebp` | Transcode raster uploads to WebP (default off) |
| `r2.webpQuality` | WebP quality 1-100 (default 80) |

Object key layout:

```
media/<siteId>/<folder-path>/<slugified-filename>
```

- `<folder-path>` is the slugified chain of Media folders (for example `promos/summer-2024`); omitted for root uploads.
- No timestamp or uniqueness suffix: the same name in the same site and folder overwrites the object.
- The bucket name is **not** part of the key (it is passed as the `Bucket` parameter). The "Fetch R2" endpoint rebuilds the folder tree from keys, so this layout is a contract.
- Stored `url`: `<publicBaseUrl>/<key>` when `publicBaseUrl` is set.
- If `publicBaseUrl` is empty, files are served through the CMS media route, which answers with a 302 redirect to a one-hour signed R2 URL. That route needs a resolvable site context (admin site cookie, a Sites edit-page referer, or a single-site user) and returns 401 to anonymous requests, so set `publicBaseUrl` for any site whose media is public. Cross-site reads return 403 for non-super-admins.

S3 clients are cached per `accountId:accessKeyId:bucket`, with a 5 s connect timeout, 20 s request timeout and one retry, because uploads run inside the database transaction.

### Fetch R2 (reconcile)

`POST /api/media/fetch-from-r2` (button **Fetch R2** in the Media Library) lists the selected site's bucket and creates Media documents for objects that have no database row, without re-uploading. Folders are recreated from key paths. Up to 200 objects per call (objects over 50 MB are skipped); the response reports `imported`, `skipped`, `foldersCreated`, `errors` and `remainder`; click again to continue. It is idempotent and R2-only: on a local-disk site it returns an error.

## Upload pipeline

Triggers: the Media Library dropzone, pasting or dropping an image in the Markdown editor, `POST /api/media` (multipart), and [Import from URL](#import-from-url).

1. **`beforeOperation`**: on `create`/`update` with a file, resolve the owning site (`src/lib/resolve-upload-tenant.ts`): explicit `tenant` in the body, then the admin's selected-site cookie `payload-tenant`, then the referer when it is a Sites edit page (`/admin/collections/sites/<id>`), then the user's only site. A non-super-admin cannot upload into a site they do not belong to. If the site has R2 config, run the WebP step (below), mutating `req.file` in place so Payload stores the WebP bytes and their dimensions.
2. **`beforeChange`**: put the site and the slugified folder path into the request context; on `create` set `media.tenant` (it is never reassigned by later edits; only super-admins can change it by hand).
3. **Adapter `handleUpload`**: write to local disk or R2 as described above and return the file URL.
4. **`afterRead`**: if `externalUrl` is set it replaces `url`; otherwise, when `version > 1`, `?v=<version>` is appended to bust CDN caches after an image edit (only effective on a CDN whose cache key includes the query string).

Required fields: `alt` is mandatory. Multipart clients must send fields inside a `_payload` JSON part (`{"alt":"...","folder":null}`); Payload 3 ignores loose form fields and returns 400.

Other Media fields: `tenant` (site, indexed), `externalUrl` (http/https only, max 500 chars; non-super-admins cannot point it into the CMS `media/` key space), `version` (hidden, cache-bust counter), and `folder` (Payload's native folders).

Access: public `read`; `create` needs membership of at least one site (or super-admin); `update` and `delete` are limited to the user's sites.

### WebP on upload

R2 sites only, when `r2.compressToWebp` is on. Handled by `src/lib/webp-on-upload.ts` with `sharp`.

| Outcome | When |
| --- | --- |
| Converted to WebP at `r2.webpQuality`, extension changed to `.webp` | JPEG, PNG, TIFF or AVIF input |
| Skipped (`skipped-mime`) | Other types. SVG is deliberately never converted |
| Skipped (`animated-gif`) | Multi-frame GIF |
| Skipped (`larger`) | The WebP result is bigger than the original; the original is kept |
| Skipped (`disabled`) | Toggle off (default) |

## Folders

Media uses Payload's native folders (`folders: true`, collection `payload-folders`, scoped to the site by `src/collections/payload-folders-tenant-scope.ts`). Payload's global "Browse by Folder" view is hidden; the Media Library list view (`media-grid-list-view.tsx`) provides breadcrumbs, subfolder navigation, a new-folder form and a move-to-folder control per item. The view also has grid/list modes, filename/alt search, type chips (all, images, video, documents), a lightbox and multi-file drag-and-drop upload, always scoped to the site selected in the admin site switcher.

## Image editor

`POST /api/media/:id/edit-image` (opened from an image in the Media Library) applies, in this order: rotate, flip horizontally/vertically, crop, resize.

| Body field | Constraint |
| --- | --- |
| `rotate` | `0`, `90`, `180` or `270` |
| `flipH`, `flipV` | boolean |
| `crop` | `{ left, top, width, height }` in source pixels; must lie inside the image |
| `resizeWidth` | 1 to 8192; height follows the aspect ratio |

The edit is **destructive**: the file is overwritten in place (same path or key, so URLs stay valid), `width`, `height`, `filesize` and `version` are updated, and the UI asks for confirmation first. On R2 sites with `compressToWebp` on, the result is re-encoded as WebP (filename extension updated). The caller must belong to the file's site (super-admins excepted). Documents that are not stored in CMS-managed storage (for example `externalUrl` references) are rejected with 400.

## Import from URL

`POST /api/media/from-url` (button **Paste URL** in the Media Library, and the URL tab of the editor's image dialog) downloads a remote image on the server and stores it as a normal Media document, with `externalUrl` set to the source URL.

Request (JSON, authenticated): `{ "url": "https://example.com/photo.jpg", "alt": "optional", "folder": null, "tenant": "optional site id" }`. Response `201`: `{ ok, id, url, alt, filename }`.

Limits and SSRF guard (`src/lib/ssrf-guard.ts`, `src/endpoints/create-media-from-url-helpers.ts`):

| Protection | Behavior |
| --- | --- |
| Scheme and length | `http`/`https` only, URL at most 500 characters |
| Address block-list | Hostname is resolved first (5 s timeout); the request is refused with 422 if **any** resolved address is private or reserved: `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16` (cloud metadata), `0/8`, `100.64/10`, multicast, reserved, and the IPv6 loopback, unique-local, link-local and unspecified ranges. IP-literal hosts are checked the same way |
| Redirects | Followed manually, at most 3 hops; every `Location` is re-validated with the same guard |
| Timeout | 15 s per request |
| Size | Body capped at 25 MB (`Content-Length` pre-check plus streaming cap) |
| Residual risk | Node's `fetch` re-resolves DNS at connect time, so a DNS-rebinding window remains between validation and connection; it needs admin access plus attacker-controlled DNS |

## Serving URLs at a glance

| Source | `url` returned by REST |
| --- | --- |
| Local disk | `<PAYLOAD_PUBLIC_SERVER_URL>/api/media/file/<filename>?t=<siteId>` |
| R2 with `publicBaseUrl` | `<publicBaseUrl>/media/<siteId>/[<folder-path>/]<filename>` |
| R2 without `publicBaseUrl` | CMS media route (signed-URL redirect; needs site context) |
| `externalUrl` set | The `externalUrl` value |
| After an image edit (`version > 1`) | Any of the above plus `?v=<version>` |

Because local URLs embed `PAYLOAD_PUBLIC_SERVER_URL` at upload time, changing the public domain later leaves the old origin in existing `url` values; keep the origin stable or rewrite the `url` column of the `media` table.

## Backups

Back up **both** the database and the media directory; the database only holds metadata and paths.

- Local disk: archive the directory behind `MEDIA_DIR`. Both `docker-compose.yml` and `docker-compose.coolify.yml` mount the `media_data` named volume at `/app/media` (the image runs as the `node` user, so a bind mount in its place must be writable by that user). `docker compose down -v` deletes the volume. Archive it with:

  ```bash
  docker run --rm -v <project>_media_data:/media -v "$PWD":/backup alpine \
    tar czf /backup/media-backup.tgz -C /media .
  ```

  Find the exact volume name with `docker volume ls` (Compose prefixes it with the project name). Restore by extracting into an empty volume at the same layout (`<siteId>/<filename>`).
- R2 sites: use bucket versioning or replicate the bucket with your own tooling (for example `rclone sync` to another bucket); the CMS does not back up R2.
- Take the database dump and the file archive close together so every `media` row has its file.

## Migrating from local disk to R2

There is no built-in migration command. Existing local files keep working after you enable R2 for a site (their stored URLs still point at the local route), and only **new** uploads go to R2. For a full move:

1. Create the bucket and an API token; enable a public domain for it.
2. Copy each site's files into the bucket under the R2 key layout: `<MEDIA_DIR>/<siteId>/<file>` becomes `media/<siteId>/<file>` (for example with `rclone copy`). Keep the same filenames.
3. Fill in `Sites.r2` (bucket, account ID, public base URL, key pair) as a super-admin.
4. Rewrite each migrated Media document's `url` to `<publicBaseUrl>/media/<siteId>/<filename>` (a one-off script through the Local API, or SQL on the `media` table). Content that embeds media by URL in Markdown must be rewritten too.
5. Verify a few files over the CDN, then remove the local files and volume.

Skip step 4 and the documents keep serving from the local route, which only works while the files stay on disk.

## Operational notes

- An upload holds its Postgres connection for the whole transcode and storage write. The connection pool and idle-in-transaction timeout are raised for this reason; see [architecture.md](architecture.md).
- `Sites.r2` credentials are write-only and super-admin-only. Do not put them in env files.
- Overwrite-on-same-name is intentional on both backends.

See also: [multi-site.md](multi-site.md), [roles-and-permissions.md](roles-and-permissions.md), [content-markdown.md](content-markdown.md).
