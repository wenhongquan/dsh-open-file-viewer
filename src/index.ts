/**
 * Host half of dsh-open-file-viewer.
 *
 * Everything this plugin does happens in the browser: it registers a file
 * viewer with dsh-better-sidebar's client service (see `lib/client.js`). The
 * host half exists only to give the bundle a valid Node entry for the profile
 * loader to import, and to keep the two halves' lifecycle honest — a no-op
 * that documents itself rather than an empty file.
 */

/** Client-side plugin id, matching the bundle row in cordis.patch.yml. */
const name = 'dsh-open-file-viewer'

/**
 * Nothing to wait for: no host services are used, and registering the viewer
 * would fail before the client exists. Declaring an empty list keeps the
 * loader's dependency graph honest.
 */
const inject: string[] = []

/** No-op host mount. */
function apply(): void {}

export { apply, inject, name }
