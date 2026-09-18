#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "xhs_config.json");
let cfg;
try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (error) { console.error(`invalid JSON: ${error.message}`); process.exit(1); }

const errors = [];
if ((!String(cfg.accountName || "").trim() || cfg.accountName === "你的店铺或主播名") && cfg.autoDetectAccount !== true) errors.push("accountName must be set unless autoDetectAccount is true");
if (!Array.isArray(cfg.messages) || cfg.messages.length === 0) errors.push("messages must be a non-empty array");
else cfg.messages.forEach((message, index) => {
  const text = String(message || "").trim();
  if (!text) errors.push(`messages[${index}] is empty`);
  if (text.length > (Number(cfg.maxMessageChars) || 40)) errors.push(`messages[${index}] is too long (${text.length})`);
});
const interval = Number(cfg.intervalMinutes);
if (!Number.isFinite(interval) || interval < 1 || interval > 60) errors.push("intervalMinutes must be between 1 and 60");
if (String(cfg.targetUrlKeyword || "") !== "ark.xiaohongshu.com/live_center_control") errors.push("targetUrlKeyword must be ark.xiaohongshu.com/live_center_control");

if (errors.length) {
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, messages: cfg.messages.length, intervalMinutes: interval }));
