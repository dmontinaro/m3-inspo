/**
 * The URL guard for everything the capture worker loads: start URL,
 * redirects and sub-resources. DNS answers come from a fake resolver, so no
 * test touches the network.
 */

import { describe, expect, it } from "vitest";
import { BlockedUrlError, assertPublicUrl } from "./public-url";

/** A resolver that knows only these names. */
const dns =
  (records: Record<string, string[]>) =>
  async (hostname: string): Promise<string[]> => {
    const addresses = records[hostname];
    if (!addresses) throw new Error(`getaddrinfo ENOTFOUND ${hostname}`);
    return addresses;
  };

const publicDns = dns({
  "linear.app": ["76.76.21.21", "2606:4700::6810:84e5"],
  "www.designhotels.com": ["151.101.2.132"],
});

/** Why `url` is refused, or "allowed". */
async function verdict(url: string, resolve = publicDns) {
  try {
    await assertPublicUrl(url, resolve);
    return "allowed";
  } catch (error) {
    if (error instanceof BlockedUrlError) return error.reason;
    throw error;
  }
}

describe("assertPublicUrl", () => {
  it("allows public http and https pages on their default ports", async () => {
    expect(await verdict("https://linear.app/features")).toBe("allowed");
    expect(await verdict("http://www.designhotels.com/")).toBe("allowed");
    expect(await verdict("https://linear.app:443/")).toBe("allowed");
    expect(await verdict("http://linear.app:80/")).toBe("allowed");
    expect(await verdict("https://76.76.21.21/")).toBe("allowed");
  });

  it("returns the parsed URL and the addresses it checked", async () => {
    const checked = await assertPublicUrl("https://LINEAR.app/pricing?plan=pro", publicDns);

    expect(checked.url.href).toBe("https://linear.app/pricing?plan=pro");
    expect(checked.addresses).toEqual(["76.76.21.21", "2606:4700::6810:84e5"]);
    expect((await assertPublicUrl("http://[2606:4700::1]/", publicDns)).addresses).toEqual(["2606:4700::1"]);
  });

  it("asks DNS for the host name without a trailing dot, so both spellings are one name", async () => {
    const asked: string[] = [];
    const recording = async (hostname: string) => {
      asked.push(hostname);
      return ["76.76.21.21"];
    };

    await assertPublicUrl("https://linear.app./", recording);
    await assertPublicUrl("https://LINEAR.APP/", recording);

    expect(asked).toEqual(["linear.app", "linear.app"]);
  });

  it("refuses other schemes", async () => {
    for (const url of ["file:///etc/passwd", "ftp://linear.app/", "javascript:alert(1)", "data:text/html,hi", "ws://linear.app/", "chrome://settings"]) {
      expect(await verdict(url), url).toBe("scheme");
    }
  });

  it("refuses ports other than 80 and 443", async () => {
    for (const url of ["https://linear.app:8443/", "http://linear.app:22/", "http://linear.app:6379/"]) {
      expect(await verdict(url), url).toBe("port");
    }
  });

  it("refuses credentials in the address", async () => {
    expect(await verdict("https://admin:secret@linear.app/")).toBe("credentials");
    expect(await verdict("https://token@linear.app/")).toBe("credentials");
  });

  it("refuses what is no URL at all", async () => {
    expect(await verdict("not a url")).toBe("invalid");
    expect(await verdict("")).toBe("invalid");
  });

  it("refuses internal host names without asking DNS", async () => {
    const hosts = [
      "localhost",
      "LOCALHOST.",
      "app.localhost",
      "postgres.railway.internal",
      "web.railway.internal.",
      "metadata.google.internal",
      "printer.local",
      "intranet",
    ];
    const asked: string[] = [];
    const recording = async (hostname: string) => {
      asked.push(hostname);
      return ["76.76.21.21"];
    };

    for (const host of hosts) {
      expect(await verdict(`http://${host}/`, recording), host).toBe("host");
    }
    expect(asked).toEqual([]);
  });

  it("refuses private, loopback, link-local and reserved IPv4 addresses", async () => {
    const addresses = [
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.254",
      "192.168.1.1",
      "127.0.0.1",
      "127.1.2.3",
      "169.254.169.254",
      "169.254.0.1",
      "100.64.0.1",
      "100.127.255.254",
      "0.0.0.0",
      "0.1.2.3",
      "224.0.0.1",
      "239.255.255.250",
      "240.0.0.1",
      "255.255.255.255",
      "192.0.2.1",
      "198.18.0.1",
      "192.31.196.1",
      "192.52.193.1",
      "192.175.48.1",
    ];
    for (const address of addresses) {
      expect(await verdict(`http://${address}/`), address).toBe("private-address");
    }
  });

  it("refuses the metadata address and loopback in every IPv4 spelling", async () => {
    for (const url of ["http://2852039166/", "http://0xa9fea9fe/", "http://0251.0376.0251.0376/", "http://0x7f.1/", "http://2130706433/"]) {
      expect(await verdict(url), url).toBe("private-address");
    }
  });

  it("keeps public neighbours of private ranges", async () => {
    for (const address of ["172.32.0.1", "100.128.0.1", "169.255.0.1", "11.0.0.1", "192.169.0.1"]) {
      expect(await verdict(`http://${address}/`), address).toBe("allowed");
    }
  });

  it("refuses private, loopback, link-local and multicast IPv6 addresses", async () => {
    const addresses = ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "febf::1", "ff02::1", "2001:db8::1", "64:ff9b::a00:1"];
    for (const address of addresses) {
      expect(await verdict(`http://[${address}]/`), address).toBe("private-address");
    }
  });

  it("refuses IPv4-mapped IPv6 addresses of private ranges", async () => {
    for (const address of ["::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:10.0.0.1", "::ffff:a9fe:a9fe"]) {
      expect(await verdict(`http://[${address}]/`), address).toBe("private-address");
    }
  });

  it("allows a public IPv6 address", async () => {
    expect(await verdict("http://[2606:4700::6810:84e5]/")).toBe("allowed");
  });

  it("refuses a public-looking name that resolves to loopback", async () => {
    const rebinding = dns({ "127.0.0.1.nip.io": ["127.0.0.1"], "shop.example.com": ["::1"] });

    expect(await verdict("http://127.0.0.1.nip.io/", rebinding)).toBe("private-address");
    expect(await verdict("https://shop.example.com/", rebinding)).toBe("private-address");
  });

  it("refuses a name when any of its addresses is private", async () => {
    const mixed = dns({ "split.example.com": ["76.76.21.21", "10.0.0.7"], "v6.example.com": ["2606:4700::1", "fd00::7"] });

    expect(await verdict("https://split.example.com/", mixed)).toBe("private-address");
    expect(await verdict("https://v6.example.com/", mixed)).toBe("private-address");
  });

  it("refuses a name that does not resolve", async () => {
    expect(await verdict("https://nowhere.example.com/")).toBe("unresolvable");
    expect(await verdict("https://empty.example.com/", async () => [])).toBe("unresolvable");
  });

  it("explains the refusal without echoing the address", async () => {
    const refusal = await assertPublicUrl("http://169.254.169.254/latest/meta-data/", publicDns).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(BlockedUrlError);
    expect(String(refusal)).toMatch(/private or reserved address/);
    expect(String(refusal)).not.toContain("meta-data");
  });
});
