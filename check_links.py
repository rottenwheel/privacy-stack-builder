#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 schmidt1024
"""Check every tool URL in data/tools/*.yaml.

Fails (exit 1) on:
  - DNS failures, 404, 410, 5xx
  - a redirect that lands on a different registrable domain than the one in
    the data file (possible domain takeover or silent move)
Warns (exit 0) on 401/403/429 and on connection resets or timeouts that
persist after a retry; from a datacenter IP those usually mean bot
blocking, not a dead site. Prints ::error:: / ::warning:: lines so CI annotates them.
"""
import concurrent.futures as cf
import glob
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import yaml

ROOT = os.path.dirname(os.path.abspath(__file__))
UA = "Mozilla/5.0 (X11; Linux x86_64) privacystack.rocks link check (+https://privacystack.rocks)"
TIMEOUT = 25
SOFT = {401, 403, 429}


def registrable(host):
    """Crude eTLD+1: last two labels, three for common second-level ccTLDs."""
    parts = host.lower().split(".")
    if len(parts) >= 3 and parts[-2] in {"co", "com", "org", "net", "ac", "gov"} and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def fetch(url):
    ctx = ssl.create_default_context()
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as r:
                return r.status, r.geturl(), None
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (405, 400, 403, 404):
                continue  # some servers reject HEAD; retry with GET
            return e.code, e.geturl() or url, None
        except Exception as e:  # noqa: BLE001
            if method == "HEAD":
                continue
            return None, url, f"{type(e).__name__}: {e}"
    return None, url, "unreachable"


def check(tool):
    url = tool["url"]
    status, final, err = fetch(url)
    if err and "Name or service not known" not in err and "nodename nor servname" not in err:
        # Resets and timeouts are often anti-bot measures against datacenter
        # IPs; give it one more try before deciding.
        time.sleep(4)
        status, final, err = fetch(url)
    src = registrable(urllib.parse.urlparse(url).hostname or "")
    dst = registrable(urllib.parse.urlparse(final).hostname or "") if final else ""
    if err or status is None:
        msg = err or "no response"
        if "Name or service not known" in msg or "nodename nor servname" in msg:
            return "error", tool, f"{url} -> {msg}"
        return "warning", tool, f"{url} -> {msg} (unreachable from CI, verify by hand)"
    if status in SOFT:
        return "warning", tool, f"{url} -> HTTP {status} (likely bot blocking)"
    if status >= 400:
        return "error", tool, f"{url} -> HTTP {status}"
    if dst and dst != src:
        return "error", tool, f"{url} -> redirected off-domain to {final}"
    return "ok", tool, f"{url} -> {status}"


def main():
    tools = []
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "tools", "*.yaml"))):
        with open(path, encoding="utf-8") as f:
            tools.extend(yaml.safe_load(f) or [])

    counts = {"ok": 0, "warning": 0, "error": 0}
    with cf.ThreadPoolExecutor(max_workers=12) as ex:
        for level, tool, msg in ex.map(check, tools):
            counts[level] += 1
            if level == "ok":
                if os.environ.get("VERBOSE"):
                    print(f"ok       {tool['id']}: {msg}")
            else:
                print(f"::{level} title={tool['id']}::{msg}")
                print(f"{level:8} {tool['id']}: {msg}", file=sys.stderr)

    print(f"\n{len(tools)} urls: {counts['ok']} ok, {counts['warning']} warnings, {counts['error']} errors")
    return 1 if counts["error"] else 0


if __name__ == "__main__":
    sys.exit(main())
