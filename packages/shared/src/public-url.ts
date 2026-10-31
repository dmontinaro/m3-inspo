/**
 * The URL guard (docs/spec.md, URL-Prüfung): whether an address may be
 * loaded on the owner's behalf. The capture worker runs it on the start URL,
 * every redirect and every sub-resource; the web app runs it before queueing
 * an import, so a blocked address is refused right away.
 *
 * ```ts
 * const { url, addresses } = await assertPublicUrl("https://linear.app"); // connect only to `addresses`
 * await assertPublicUrl("http://169.254.169.254/");       // throws BlockedUrlError, reason "private-address"
 * await assertPublicUrl(url, cachedResolver);             // another resolver, e.g. a per-job cache
 * ```
 *
 * Whoever loads the URL must connect to the returned addresses and nothing
 * else: resolving the name again could answer differently (DNS rebinding).
 *
 * Node only (node:dns, node:net), so it is a subpath export and not part of
 * the package index the browser bundle reads.
 */

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/** Answers every address a host name resolves to (A and AAAA). Throws or answers [] when there is none. */
export type Resolve = (hostname: string) => Promise<string[]>;

export type BlockReason = "invalid" | "scheme" | "credentials" | "port" | "host" | "private-address" | "unresolvable";

const messages: Record<BlockReason, string> = {
  invalid: "not a valid URL",
  scheme: "only http and https are allowed",
  credentials: "credentials in the URL are not allowed",
  port: "only ports 80 and 443 are allowed",
  host: "internal host names are not allowed",
  "private-address": "the host points to a private or reserved address",
  unresolvable: "the host name does not resolve",
};

/** Why an address was refused. The message names the rule, never the address, so it is safe to log and show. */
export class BlockedUrlError extends Error {
  readonly reason: BlockReason;

  constructor(reason: BlockReason) {
    super(`Blocked URL: ${messages[reason]}.`);
    this.name = "BlockedUrlError";
    this.reason = reason;
  }
}

/** The system resolver, as the browser uses it (hosts file included), with every address of both families. */
export const resolveHost: Resolve = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

/**
 * IPv4 space that is not the public internet: "this network", RFC 1918,
 * CGNAT, loopback, link-local (with the cloud metadata address
 * 169.254.169.254), IETF protocol and documentation ranges, AS112 and AMT
 * anycast, benchmarking, multicast and reserved up to broadcast.
 */
const privateIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  privateIpv4.addSubnet(network, prefix, "ipv4");
}

/**
 * Public IPv6 is global unicast (2000::/3) only. Everything else is refused:
 * unspecified, loopback, IPv4-mapped and -compatible, NAT64, unique local
 * (fc00::/7), link-local (fe80::/10), site-local and multicast.
 */
const globalUnicast = new BlockList();
globalUnicast.addSubnet("2000::", 3, "ipv6");

/** Special-purpose ranges inside 2000::/3: IETF (Teredo included), documentation and 6to4. */
const reservedIpv6 = new BlockList();
reservedIpv6.addSubnet("2001::", 23, "ipv6");
reservedIpv6.addSubnet("2001:db8::", 32, "ipv6");
reservedIpv6.addSubnet("2002::", 16, "ipv6");
reservedIpv6.addSubnet("3fff::", 20, "ipv6");

/** Whether an IP address is on the public internet. Anything that is no IP address is not. */
export function isPublicAddress(address: string): boolean {
  switch (isIP(address)) {
    case 4:
      return !privateIpv4.check(address, "ipv4");
    case 6:
      return globalUnicast.check(address, "ipv6") && !reservedIpv6.check(address, "ipv6");
    default:
      return false;
  }
}

/** Names that only mean something inside a network: localhost, mDNS, `*.internal` (Railway, cloud metadata) and single labels. */
const internalHostname = /(^|\.)(localhost|local|internal)$/;

/** A URL the guard let through: parsed, and every address its host resolved to, all public. */
export type CheckedUrl = { url: URL; addresses: string[] };

/**
 * Checks `url` and returns it parsed with the addresses to connect to: http
 * or https, port 80 or 443, no credentials, no internal host name, and every
 * address the host resolves to (via `resolve`) public. Throws
 * `BlockedUrlError` otherwise. IP literals in any spelling are checked
 * without asking DNS. The host name goes to `resolve` lowercase and without
 * a trailing dot, so `linear.app.` and `linear.app` are one name.
 */
export async function assertPublicUrl(url: string, resolve: Resolve = resolveHost): Promise<CheckedUrl> {
  const parsed = URL.parse(url);
  if (!parsed) throw new BlockedUrlError("invalid");
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new BlockedUrlError("scheme");
  if (parsed.username || parsed.password) throw new BlockedUrlError("credentials");
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") throw new BlockedUrlError("port");

  // The URL parser already turned 0x7f.1 or 2130706433 into 127.0.0.1; IPv6 literals keep their brackets.
  const hostname = parsed.hostname.replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new BlockedUrlError("private-address");
    return { url: parsed, addresses: [hostname] };
  }
  if (!hostname.includes(".") || internalHostname.test(hostname)) throw new BlockedUrlError("host");

  const addresses = await resolve(hostname).catch(() => []);
  if (addresses.length === 0) throw new BlockedUrlError("unresolvable");
  if (!addresses.every(isPublicAddress)) throw new BlockedUrlError("private-address");
  return { url: parsed, addresses };
}
