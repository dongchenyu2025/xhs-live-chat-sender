/**
 * 小红书直播中控台循环话术发送器（配置驱动版）
 *
 * 功能：
 * - 按 intervalMinutes 分钟网格（如 5 → 每小时 00/05/10...）循环发送话术
 * - 每轮延迟超过 toleranceMinutes 分钟则跳过该轮，不补发、不改变后续时间
 * - 每句发送前核验：账号、直播状态、输入框为空；发送后核验：输入框清空 + 互动列表新增
 * - 规则型审计（零 token）：条数、顺序、重复嫌疑、连续失败告警
 * - 自愈：Chrome 掉线自动拉起、标签页丢失自动重开、全部网络调用带超时
 * - 配置热更新：修改 config JSON 后下一轮自动生效，无需重启
 *
 * 启动：node xhs_sender.js [--immediate]   （--immediate 立即发一组再进网格）
 * 停止：kill -TERM $(cat xhs_sender.pid)
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");
const os = require("os");

const DIR = __dirname;
const CONFIG_FILE = path.join(DIR, "xhs_config.json");
const LOG_FILE = path.join(DIR, "xhs_send.log");
const ALERT_FILE = path.join(DIR, "xhs_alerts.log");
const PID_FILE = path.join(DIR, "xhs_sender.pid");
const STATE_FILE = path.join(DIR, "xhs_sender.state.json");
const CHROME_PID_FILE = path.join(DIR, "xhs_chrome.pid");

const CONNECT_TIMEOUT_MS = 15000;
const FETCH_TIMEOUT_MS = 5000;

// ---------- 日志 ----------
function log(level, msg, extra) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra });
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
  console.log(line);
}
function alert(event, detail) {
  const line = JSON.stringify({ t: new Date().toISOString(), level: "alert", event, ...detail });
  try { fs.appendFileSync(ALERT_FILE, line + "\n"); } catch {}
  log("alert", event, detail);
}

// ---------- 配置（支持热更新） ----------
let lastGoodConfig = null;
function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const cfg = normalizeConfig(raw);
    if (cfg) { lastGoodConfig = cfg; return cfg; }
    throw new Error("INVALID_CONFIG");
  } catch (e) {
    if (lastGoodConfig) {
      log("warn", "CONFIG_INVALID_KEEP_LAST", { err: String(e.message || e) });
      return lastGoodConfig;
    }
    log("error", "CONFIG_INVALID_FATAL", { err: String(e.message || e) });
    process.exit(1);
  }
}
function normalizeConfig(raw) {
  if (!raw || !Array.isArray(raw.messages)) return null;
  const messages = raw.messages.map((m) => String(m).trim()).filter((m) => m.length > 0);
  if (!messages.length) return null;
  const accountName = String(raw.accountName || "").trim();
  if (!accountName || accountName === "你的店铺或主播名") return null;
  const targetUrlKeyword = String(raw.targetUrlKeyword || "ark.xiaohongshu.com/live_center_control");
  if (targetUrlKeyword !== "ark.xiaohongshu.com/live_center_control") return null;
  const maxChars = Number(raw.maxMessageChars) || 40;
  if (messages.some((message) => message.length > maxChars)) return null;
  const intervalMinutes = Math.min(60, Math.max(1, Number(raw.intervalMinutes) || 5));
  const toleranceMinutes = raw.toleranceMinutes
    ? Math.min(intervalMinutes - 1, Math.max(1, Number(raw.toleranceMinutes)))
    : Math.max(1, Math.floor(intervalMinutes * 0.8)); // 默认与 5 分钟/4 分钟容差同比例
  const gap = Array.isArray(raw.messageGapMs) && raw.messageGapMs.length === 2
    ? [Math.max(500, raw.messageGapMs[0]), Math.max(500, raw.messageGapMs[1])]
    : [2000, 5000];
  return {
    accountName,
    targetUrlKeyword,
    cdpUrl: String(raw.cdpUrl || "http://127.0.0.1:9222"),
    chromeBinary: String(raw.chromeBinary || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    chromeProfileDir: String(raw.chromeProfileDir || path.join(os.homedir(), ".workbuddy/chrome-xhs")).replace(/^~/, os.homedir()),
    messages,
    maxChars,
    intervalMinutes,
    toleranceMinutes,
    messageGapMs: gap,
  };
}
// 话术超长过滤（发送框有字数上限）
function usableMessages(cfg) {
  return cfg.messages;
}

// ---------- 进程/状态 ----------
try {
  const old = Number(fs.readFileSync(PID_FILE, "utf8").trim());
  if (old && old !== process.pid) {
    try { process.kill(old, 0); log("warn", "ALREADY_RUNNING_EXIT", { otherPid: old }); process.exit(0); } catch {}
  }
} catch {}
fs.writeFileSync(PID_FILE, String(process.pid));
function cleanExit() {
  try {
    if (Number(fs.readFileSync(PID_FILE, "utf8")) === process.pid) fs.unlinkSync(PID_FILE);
  } catch {}
}
process.on("exit", cleanExit);
process.on("SIGTERM", () => { log("info", "RECEIVED_STOP"); process.exit(0); });
process.on("SIGINT", () => { log("info", "RECEIVED_STOP"); process.exit(0); });

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
function saveState(patch) {
  const s = { ...loadState(), ...patch, updatedAt: new Date().toISOString() };
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 审计 ----------
const CRITICAL_EVENTS = new Set([
  "CDP_CONNECT_FAILED", "TARGET_TAB_UNAVAILABLE", "ACCOUNT_MISMATCH",
  "INPUT_MISSING", "SEND_FAILED", "SLOT_DEADLINE_ABORT",
]);
let consecutiveBadSlots = 0;
function auditGroup(slot, cfg, results, immediate, elapsedMs) {
  const expect = cfg.messages.length;
  const issues = [];
  if (results.length !== expect) issues.push(`MSG_COUNT_${results.length}_OF_${expect}`);
  results.forEach((r, i) => {
    if (r.idx !== i) issues.push(`ORDER_BROKEN_AT_${i}`);
    if (!r.ok) issues.push(`NOT_SENT_IDX_${i}${r.err ? ":" + r.err : ""}`);
    if (r.ok && r.delta > 1) issues.push(`DUPLICATE_SUSPECT_IDX_${i}_DELTA_${r.delta}`);
  });
  const ok = issues.length === 0;
  log(ok ? "info" : "warn", "AUDIT", {
    slot, immediate, sent: results.filter((r) => r.ok).length, of: expect,
    deltas: results.map((r) => r.delta), issues, elapsedMs,
  });
  if (ok) consecutiveBadSlots = 0;
  else {
    consecutiveBadSlots += 1;
    alert("GROUP_AUDIT_FAIL", { slot, issues, consecutiveBadSlots });
    if (consecutiveBadSlots >= 2) alert("REPEATED_FAILURE_NEEDS_ATTENTION", { slot, consecutiveBadSlots, issues });
  }
}
function noteEvent(slot, event, detail) {
  log(CRITICAL_EVENTS.has(event) ? "error" : "info", event, { slot, ...detail });
  if (event === "NOT_LIVE_KEEP_CHECKING") { consecutiveBadSlots = 0; return; }
  if (CRITICAL_EVENTS.has(event)) {
    consecutiveBadSlots += 1;
    alert("SLOT_ABORT", { slot, event, consecutiveBadSlots });
    if (consecutiveBadSlots >= 2) alert("REPEATED_FAILURE_NEEDS_ATTENTION", { slot, consecutiveBadSlots, lastEvent: event });
  }
}

// ---------- 浏览器 ----------
async function ensureChrome(cfg) {
  try {
    const r = await fetch(cfg.cdpUrl + "/json/version", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (r.ok) return true;
  } catch {}
  log("warn", "CDP_DOWN_RELAUNCH_CHROME");
  const { spawn } = require("child_process");
  const child = spawn(
    cfg.chromeBinary,
    [
      "--user-data-dir=" + cfg.chromeProfileDir,
      "--remote-debugging-port=" + (new URL(cfg.cdpUrl).port || "9222"),
      "--no-first-run",
      "--no-default-browser-check",
      "https://" + cfg.targetUrlKeyword,
    ],
    { detached: true, stdio: "ignore" }
  );
  try { fs.writeFileSync(CHROME_PID_FILE, String(child.pid)); } catch {}
  child.unref();
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const r = await fetch(cfg.cdpUrl + "/json/version", { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (r.ok) return true;
    } catch {}
  }
  return false;
}

async function findControlPage(browser, keyword) {
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes(keyword)) return p;
    }
  }
  return null;
}

async function precheck(page, cfg) {
  return page.evaluate((account) => {
    const body = document.body.innerText || "";
    const input = document.querySelector('textarea[placeholder*="发送消息"]');
    return {
      accountOk: !account || body.includes(account),
      live: body.includes("已开播") || body.includes("直播中"),
      hasInput: !!input,
      inputLen: input ? input.value.length : -1,
      bodyHead: body.slice(0, 200),
    };
  }, cfg.accountName);
}

// ---------- 发送 ----------
function countInFeed(bodyText, account, message) {
  return bodyText.split(`${account}: ${message}`).length - 1;
}

async function fillAndSend(page, message) {
  const filled = await page.evaluate((text) => {
    const input = document.querySelector('textarea[placeholder*="发送消息"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return input.value === text;
  }, message);
  if (!filled) return { sent: false, err: "FILL_FAILED" };
  await page.keyboard.press("Enter");
  return { sent: true };
}

async function verifySent(page, account, message, beforeCount) {
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const st = await page.evaluate(() => {
      const body = document.body.innerText || "";
      const input = document.querySelector('textarea[placeholder*="发送消息"]');
      return { body, inputLen: input ? input.value.length : -1 };
    });
    const afterCount = countInFeed(st.body, account, message);
    if (st.inputLen === 0 && afterCount > beforeCount) return { ok: true, delta: afterCount - beforeCount };
  }
  return { ok: false, delta: 0 };
}

async function sendOne(page, cfg, message) {
  const st0 = await page.evaluate(() => {
    const body = document.body.innerText || "";
    const input = document.querySelector('textarea[placeholder*="发送消息"]');
    return { body, inputLen: input ? input.value.length : -1 };
  });
  if (st0.inputLen !== 0) return { ok: false, err: "INPUT_NOT_EMPTY", delta: 0 };
  const beforeCount = countInFeed(st0.body, cfg.accountName, message);

  const r = await fillAndSend(page, message);
  if (!r.sent) return { ok: false, err: r.err, delta: 0 };
  const v = await verifySent(page, cfg.accountName, message, beforeCount);
  if (v.ok) return { ok: true, delta: v.delta };
  // Never send again after an ambiguous result: avoiding duplicates is safer than guessing.
  return { ok: false, err: "SEND_UNVERIFIED_NO_RETRY", delta: 0 };
}

// ---------- 单轮执行 ----------
async function runGroup(slotLabel, isImmediate) {
  const cfg = readConfig(); // 每轮读取最新配置（热更新）
  const messages = usableMessages(cfg);
  if (!messages) { noteEvent(slotLabel, "NO_USABLE_MESSAGES", {}); return; }

  const groupStart = Date.now();
  const deadline = groupStart + cfg.toleranceMinutes * 60000;
  const results = [];
  let browser = null;
  for (let attempt = 1; attempt <= 2 && !browser; attempt++) {
    if (!(await ensureChrome(cfg))) { await sleep(4000); continue; }
    try {
      browser = await chromium.connectOverCDP(cfg.cdpUrl, { timeout: CONNECT_TIMEOUT_MS });
    } catch (e) {
      log("warn", "CDP_CONNECT_RETRY", { slot: slotLabel, attempt, err: String(e.message || e).slice(0, 120) });
      await sleep(5000);
    }
  }
  if (!browser) { noteEvent(slotLabel, "CDP_CONNECT_FAILED", { attempts: 2 }); return; }

  try {
    let page = await findControlPage(browser, cfg.targetUrlKeyword);
    if (!page) {
      log("warn", "TARGET_TAB_MISSING_REOPEN", { slot: slotLabel });
      const ctx = browser.contexts()[0];
      page = await ctx.newPage();
      await page.goto("https://" + cfg.targetUrlKeyword, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
      await sleep(6000);
      page = await findControlPage(browser, cfg.targetUrlKeyword);
    }
    if (!page) { noteEvent(slotLabel, "TARGET_TAB_UNAVAILABLE", {}); return; }
    await page.bringToFront().catch(() => {});
    const pc = await precheck(page, cfg);
    if (!pc.accountOk) { noteEvent(slotLabel, "ACCOUNT_MISMATCH", {}); return; }
    if (!pc.live) { noteEvent(slotLabel, "NOT_LIVE_KEEP_CHECKING", { bodyHead: pc.bodyHead }); return; }
    if (!pc.hasInput) { noteEvent(slotLabel, "INPUT_MISSING", {}); return; }

    for (let i = 0; i < messages.length; i++) {
      if (i > 0) {
        const [lo, hi] = cfg.messageGapMs;
        await sleep(lo + Math.random() * Math.max(0, hi - lo));
      }
      if (Date.now() > deadline) {
        noteEvent(slotLabel, "SLOT_DEADLINE_ABORT", { done: i, remaining: messages.length - i });
        auditGroup(slotLabel, cfg, results, isImmediate, Date.now() - groupStart);
        return;
      }
      const r = await sendOne(page, cfg, messages[i]);
      results.push({ idx: i, ok: r.ok, err: r.err || null, delta: r.delta });
      if (!r.ok) noteEvent(slotLabel, "SEND_FAILED", { idx: i, err: r.err });
      else log("info", "SENT", { slot: slotLabel, idx: i, chars: messages[i].length, delta: r.delta });
    }
    auditGroup(slotLabel, cfg, results, isImmediate, Date.now() - groupStart);
  } catch (e) {
    log("error", "GROUP_ERROR", { slot: slotLabel, err: String(e.message || e) });
  } finally {
    await browser.close().catch(() => {});
  }
}

// ---------- 调度 ----------
function nextSlotAfter(t, slotMs) {
  return Math.ceil((t + 1000) / slotMs) * slotMs;
}

(async () => {
  const args = process.argv.slice(2);
  const forceImmediate = args.includes("--immediate");
  const cfg = readConfig();
  const st = loadState();
  const last = Number(st.lastGroupStartAt) || 0;
  const gapFromLast = Date.now() - last;
  log("info", "RUNNER_STARTED", {
    pid: process.pid,
    mode: forceImmediate ? "IMMEDIATE" : "RESUME",
    lastGroupStartAt: last ? new Date(last).toISOString() : null,
    messages: cfg.messages.length,
    intervalMinutes: cfg.intervalMinutes,
    toleranceMinutes: cfg.toleranceMinutes,
  });

  let lastStart;
  if (forceImmediate || !last) {
    lastStart = Date.now();
    saveState({ lastGroupStartAt: lastStart });
    await runGroup("IMMEDIATE", true);
  } else {
    // 中断恢复：按网格继续，错过的轮次自动跳过；间隔取当前配置
    log("info", gapFromLast < cfg.toleranceMinutes * 60000 ? "RESUME_SKIP_IMMEDIATE" : "RESUME_GRID", { gapMs: gapFromLast });
    lastStart = last;
  }

  for (;;) {
    const cfgNow = readConfig(); // 支持运行中修改间隔
    const slotMs = cfgNow.intervalMinutes * 60000;
    const toleranceMs = cfgNow.toleranceMinutes * 60000;
    let slot = nextSlotAfter(lastStart + toleranceMs, slotMs);
    for (;;) {
      const now = Date.now();
      if (now < slot) { await sleep(Math.min(slot - now, 15000)); continue; }
      if (now > slot + toleranceMs) {
        log("warn", "SLOT_SKIPPED_LATE", { slot: new Date(slot).toISOString() });
        slot += slotMs;
        continue;
      }
      break;
    }
    lastStart = Date.now();
    saveState({ lastGroupStartAt: lastStart, lastSlot: new Date(slot).toISOString() });
    await runGroup(new Date(slot).toISOString().slice(11, 16), false);
  }
})().catch((e) => log("error", "FATAL", { err: String(e.message || e) }));
