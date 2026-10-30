# End-to-end test of who-controls-what: the action list, permissions, Waiting for
# you, the activity log, AI spending and the daily cap, the Job Finder assistant
# (with a mock Claude that calls tools) and the MCP server built from the action list.
#
# It WRITES to the database, so run it against a scratch database, never your real data.
# A mock Claude API is started here on port 3799, so start the app with:
#   DATABASE_URL=file:/tmp/jf-control.db ANTHROPIC_BASE_URL=http://127.0.0.1:3799 ANTHROPIC_API_KEY=test \
#     npx next dev --turbopack -H 127.0.0.1 -p 3741
#   JOB_FINDER_URL=http://127.0.0.1:3741 python3 tests/e2e/control_e2e.py
# Needs Python Playwright with Chromium.
import asyncio, json, os, subprocess, sys, tempfile, threading, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.async_api import async_playwright

BASE = os.environ.get("JOB_FINDER_URL", "http://127.0.0.1:3741").rstrip("/")
ROOT = Path(__file__).resolve().parents[2]
SHOTS = Path(os.environ.get("SHOTS", tempfile.mkdtemp(prefix="jf-control-")))
fails = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        fails.append(msg)


def api(method, path, body=None, headers=None):
    h = {"content-type": "application/json"} if body is not None else {}
    h.update(headers or {})
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


# ------------------------------------------------------------ mock Claude
seen = []  # request bodies


def sse(text):
    events = [
        {"type": "message_start", "message": {"model": "claude-sonnet-5-5", "usage": {"input_tokens": 3000, "output_tokens": 1}}},
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
        {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": text}},
        {"type": "content_block_stop", "index": 0},
        {"type": "message_delta", "delta": {"stop_reason": "end_turn"}, "usage": {"output_tokens": 400}},
        {"type": "message_stop"},
    ]
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


class Claude(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        seen.append(body)
        if body.get("stream"):
            out = sse("The owner fits data roles well: Python, SQL and two analytics projects.")
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
        else:
            last = body["messages"][-1]["content"]
            done = isinstance(last, list) and any(b.get("type") == "tool_result" for b in last)
            if done:
                content = [{"type": "text", "text": "Done: I checked what's waiting and asked the Job fit reviewer."}]
                stop = "end_turn"
            else:
                content = [
                    {"type": "text", "text": "Let me look."},
                    {"type": "tool_use", "id": "t1", "name": "list_waiting", "input": {}},
                    {"type": "tool_use", "id": "t2", "name": "ask_agent", "input": {"agent": "job-fit", "message": "Is the owner a fit for data roles?"}},
                    {"type": "tool_use", "id": "t3", "name": "approve_application", "input": {"id": "no-such-application"}},
                ]
                stop = "tool_use"
            out = json.dumps({
                "id": "msg", "type": "message", "role": "assistant", "model": body["model"], "content": content, "stop_reason": stop,
                "usage": {"input_tokens": 500, "output_tokens": 120, "cache_creation_input_tokens": 9000 if not done else 0, "cache_read_input_tokens": 9000 if done else 0},
            }).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


claude = ThreadingHTTPServer(("127.0.0.1", 3799), Claude)
threading.Thread(target=claude.serve_forever, daemon=True).start()


# --------------------------------------------------------------- MCP client
class Mcp:
    def __init__(self):
        self.p = subprocess.Popen(["node", str(ROOT / "mcp" / "server.mjs")], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, env={**os.environ, "JOB_FINDER_URL": BASE})
        self.n = 0

    def call(self, method, params=None):
        self.n += 1
        self.p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params or {}}) + "\n")
        self.p.stdin.flush()
        while True:
            msg = json.loads(self.p.stdout.readline())
            if msg.get("id") == self.n:
                return msg

    def tool(self, name, args=None):
        r = self.call("tools/call", {"name": name, "arguments": args or {}})["result"]
        return r["isError"], r["content"][0]["text"]

    def names(self):
        return {t["name"]: t for t in self.call("tools/list")["result"]["tools"]}


def chat(agent, message):
    req = urllib.request.Request(BASE + "/api/ai/chat", method="POST", data=json.dumps({"agent": agent, "message": message}).encode(), headers={"content-type": "application/json", "origin": BASE})
    events = []
    with urllib.request.urlopen(req, timeout=180) as r:
        for line in r:
            if line.strip():
                events.append(json.loads(line))
    return events


async def main():
    # --- the action list
    s, data = api("GET", "/api/actions")
    names = {a["name"]: a for a in data["actions"]}
    check(s == 200 and len(names) >= 35, f"the action list has {len(names)} actions")
    check(names["approve_application"]["level"] == "ask", "approving held applications asks the owner by default")
    check(names["ask_agent"]["level"] == "allow" and names["make_resume_version"]["level"] == "allow", "agents and writing are allowed by default")

    # --- MCP from the action list
    mcp = Mcp()
    init = mcp.call("initialize", {"protocolVersion": "2025-06-18", "clientInfo": {"name": "e2e-client", "version": "1"}, "capabilities": {}})
    check(init["result"]["capabilities"]["tools"]["listChanged"] is True, "MCP says its tool list can change")
    tools = mcp.names()
    check("ask_agent" in tools and "make_resume_version" in tools and "get_resume_pdf" in tools, "MCP lists the action list plus the PDF tools")
    check("Asks the owner first" in tools["approve_application"]["description"], "MCP marks Ask-me-first tools")
    err, text = mcp.tool("job_finder_status")
    status = json.loads(text)
    check(not err and status["permissions"]["approve"] == "ask", "job_finder_status reports permissions")
    err, text = mcp.tool("update_apply_profile", {"changes": {"city": "Testville"}})
    check(not err, "an outside AI changes My answers when allowed")
    s, prof = api("GET", "/api/apply/profile")
    check(prof.get("city") == "Testville", "the change is saved")
    err, text = mcp.tool("approve_application", {"id": "no-such-application"})
    check(not err and text.startswith("Waiting for the owner"), "approving through MCP waits for the owner")
    err, text = mcp.tool("update_my_job", {"status": "applied"})
    check(err, "bad input is refused")

    # --- the assistant uses actions and specialists as tools
    events = chat("assistant", "What's waiting for me, and am I a fit for data roles?")
    text = "".join(e.get("text", "") for e in events if e["type"] == "text")
    check(any(e["type"] == "done" for e in events), "the assistant's chat finishes")
    check("Checking what waits for you" in text and "Asking the Job Fit reviewer".lower() in text.lower(), "the chat shows each step")
    check("Done: I checked" in text, "the assistant answers after its tools ran")
    loop = [b for b in seen if not b.get("stream")]
    check(loop and isinstance(loop[0]["system"], list) and loop[0]["system"][0].get("cache_control"), "the tool loop caches its instructions")
    check(loop and loop[0]["tools"][-2].get("cache_control") or loop[0]["tools"][-1].get("cache_control"), "the tool loop caches its tools")
    check(loop and len(loop[0]["tools"]) >= 35, f"the assistant gets every action ({len(loop[0]['tools']) if loop else 0} tools)")

    # Activity log and Waiting for you
    _, out = api("POST", "/api/actions/list_activity", {"limit": 20})
    rows = out["result"]["activity"]
    check(any(r["what"].startswith("Asked the Job fit reviewer") and r["by"] == "AI in Job Finder" and r["costUsd"] > 0 for r in rows), "asking a specialist is logged with its cost")
    check(any(r["what"].startswith("Changed My answers: city") and r["by"] == "Outside AI" and r["via"] == "e2e-client" for r in rows), "the outside AI's change is logged with its client name")
    _, out = api("POST", "/api/actions/list_waiting", {})
    waiting = out["result"]["waiting"]
    check(len([w for w in waiting if w["action"] == "approve_application"]) == 2, "both approval requests wait for the owner")
    s, ctl = api("GET", "/api/control")
    check(ctl["waiting"]["requests"] == 2 and ctl["spend"]["spent"] > 0, f"the control summary counts what waits and today's spend (${ctl['spend']['spent']:.4f})")

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 900})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        # --- permissions page: turn "Change My answers and settings" to Ask me first
        await page.goto(BASE + "/settings")
        await page.get_by_text("What AI may do").first.wait_for()
        await page.get_by_role("combobox", name="Change My answers and settings: what AI may do").click()
        await page.get_by_role("option", name="Ask me first").click()
        await page.get_by_text("Saved").first.wait_for(timeout=10000)
        await page.screenshot(path=str(SHOTS / "settings.png"), full_page=True)
        _, data = api("GET", "/api/actions")
        check({a["name"]: a for a in data["actions"]}["update_apply_profile"]["level"] == "ask", "the Settings page changes what AI may do")

        # An outside AI's change now waits; approve it on the Activity page.
        err, text = mcp.tool("update_apply_profile", {"changes": {"city": "Approvedville"}})
        check(text.startswith("Waiting for the owner"), "after the change, My answers edits wait for the owner")
        await page.goto(BASE + "/activity")
        await page.get_by_text("Waiting for you (3)").wait_for()
        await page.screenshot(path=str(SHOTS / "activity.png"), full_page=True)
        await page.get_by_role("button", name="Approve: Change My answers").click()
        await page.get_by_text("Approved and done").first.wait_for(timeout=10000)
        s, prof = api("GET", "/api/apply/profile")
        check(prof.get("city") == "Approvedville", "approving in Waiting for you runs the AI's change")
        await page.get_by_role("button", name="Decline: Submit the held application").first.click()
        await page.get_by_text("Declined").first.wait_for(timeout=10000)

        # Never hides the tool from MCP.
        await page.goto(BASE + "/settings")
        await page.get_by_role("combobox", name="Find, save and dismiss jobs: what AI may do").click()
        await page.get_by_role("option", name="Never").click()
        await page.get_by_text("Saved").first.wait_for(timeout=10000)
        tools = mcp.names()
        check("save_found_job" not in tools and "search_found_jobs" in tools, "a group set to Never disappears from MCP; reading stays")
        await page.get_by_role("combobox", name="Find, save and dismiss jobs: what AI may do").click()
        await page.get_by_role("option", name="Do it").click()
        await page.wait_for_timeout(800)

        # --- the daily limit stops AI
        await page.get_by_role("spinbutton", name="Daily AI limit").fill("0.001")
        await page.get_by_role("button", name="Save limit").click()
        await page.get_by_text("Saved").first.wait_for(timeout=10000)
        events = chat("job-fit", "Am I a fit?")
        msg = next((e.get("message", "") for e in events if e["type"] == "error"), "")
        check("Today's AI limit is reached" in msg, "the daily limit stops AI calls")
        await page.get_by_role("spinbutton", name="Daily AI limit").fill("5")
        await page.get_by_role("button", name="Save limit").click()
        await page.wait_for_timeout(800)

        # --- phone width, no sideways scrolling; the badge and the dashboard banner
        for path in ["/activity", "/settings", "/assistant", "/dashboard"]:
            m = await browser.new_page(viewport={"width": 390, "height": 844})
            m.on("pageerror", lambda e: errors.append(str(e)))
            await m.goto(BASE + path)
            await m.wait_for_timeout(1200)
            wide = await m.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(wide <= 1, f"{path} fits a phone screen (overflow {wide}px)")
            await m.screenshot(path=str(SHOTS / f"phone{path.replace('/', '-')}.png"), full_page=True)
            await m.close()
        await page.goto(BASE + "/dashboard")
        await page.wait_for_timeout(1500)
        badge = await page.locator('nav[aria-label="Main"] a[href="/activity"]').inner_text()
        check(badge.strip().endswith("1"), f"the sidebar shows what waits ({badge.strip()!r})")
        check(await page.get_by_text("1 thing waiting for you").count() == 1, "the dashboard says what waits")
        await page.goto(BASE + "/assistant")
        await page.get_by_text("This agent uses Job Finder's actions").wait_for()
        await page.screenshot(path=str(SHOTS / "assistant.png"))
        real = [e for e in errors if "Download the React DevTools" not in e]
        check(not real, f"no console errors ({real[:3]})")
        await browser.close()
    mcp.p.kill()
    print(f"\nScreenshots in {SHOTS}")
    print("ALL PASSED" if not fails else f"{len(fails)} FAILED")
    sys.exit(1 if fails else 0)


asyncio.run(main())
