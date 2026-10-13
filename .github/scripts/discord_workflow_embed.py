#!/usr/bin/env python3
"""Post or patch a Discord message via Incoming Webhook (embed JSON on stdin)."""
import json
import os
import sys
import urllib.error
import urllib.request

# Cloudflare returns 403 / error 1010 if User-Agent looks like a default library bot (e.g. Python-urllib).
# Discord expects an identifiable UA; see https://discord.com/developers/docs/reference#user-agent
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "PR-CI/1.0 (GitHub Actions; +https://github.com) Python/urllib",
}


def main() -> None:
    if len(sys.argv) < 3:
        print(
            "Usage: discord_workflow_embed.py post WEBHOOK_URL < payload.json\n"
            "       discord_workflow_embed.py patch WEBHOOK_URL MESSAGE_ID < payload.json",
            file=sys.stderr,
        )
        sys.exit(2)
    mode = sys.argv[1].lower()
    webhook = sys.argv[2].strip()
    if not webhook:
        print("Empty webhook URL", file=sys.stderr)
        sys.exit(0)
    body = json.load(sys.stdin)
    if mode == "post":
        url = f"{webhook.rstrip('/')}?wait=true"
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode(),
            headers=HEADERS,
            method="POST",
        )
    elif mode == "patch":
        if len(sys.argv) < 4:
            print("patch requires MESSAGE_ID", file=sys.stderr)
            sys.exit(2)
        msg_id = sys.argv[3].strip()
        url = f"{webhook.rstrip('/')}/messages/{msg_id}"
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode(),
            headers=HEADERS,
            method="PATCH",
        )
    else:
        print("mode must be post or patch", file=sys.stderr)
        sys.exit(2)
    try:
        with urllib.request.urlopen(req) as resp:
            out = resp.read().decode()
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", errors="replace")
        print(f"Discord API HTTP {e.code}: {err}", file=sys.stderr)
        sys.exit(1)
    if mode == "post":
        data = json.loads(out)
        mid = data.get("id")
        if mid:
            gh_out = os.environ.get("GITHUB_OUTPUT")
            if gh_out:
                with open(gh_out, "a", encoding="utf-8") as f:
                    f.write(f"discord_message_id={mid}\n")
            print(mid)


if __name__ == "__main__":
    main()
