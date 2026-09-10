/**
 * The absolute URL this request arrived at, for building an OAuth return trip.
 *
 * The provider needs somewhere to send the browser back to, and it has to be
 * absolute, so it cannot be a path — it has to be reconstructed from headers.
 *
 * The previous version read `origin ?? x-forwarded-host` and prefixed the
 * result with `https://` whenever it did not already start with `http`. But
 * `x-forwarded-host` is a bare host, so a fallback to it always produced
 * `https://`, and against a dev server that means the browser opens a TLS
 * handshake nothing answers: ERR_SSL_PROTOCOL_ERROR after the account picker,
 * with the sign-in already spent. With both headers missing it built the
 * string "https://null" and sent someone there.
 */

/** Hosts that are reached over plain HTTP, whatever a proxy header claims. */
function isLoopback(host: string): boolean {
  const name = host.replace(/:\d+$/, "").toLowerCase()
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name === "127.0.0.1" ||
    name === "[::1]" ||
    name === "::1"
  )
}

/**
 * Returns the origin, or null when the headers do not identify one — the
 * caller then fails the sign-in rather than sending anyone to a made-up host.
 */
export function baseUrlFrom(headers: {
  get(name: string): string | null
}): string | null {
  // `origin` is the only one of these that already carries a scheme.
  const origin = headers.get("origin")
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, "")

  const host = headers.get("x-forwarded-host") ?? headers.get("host")
  if (!host) return null

  // A bare host says nothing about the scheme. A proxy that terminates TLS
  // says so; otherwise anything loopback is plain HTTP and everything else is
  // assumed to be served over TLS.
  const forwarded = headers.get("x-forwarded-proto")
  const proto = forwarded?.split(",")[0].trim() || (isLoopback(host) ? "http" : "https")

  return `${proto}://${host}`
}
