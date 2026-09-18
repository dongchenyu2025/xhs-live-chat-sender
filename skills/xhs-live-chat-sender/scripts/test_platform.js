#!/usr/bin/env node
const assert = require("assert");
const config = require("./xhs_config.example.json");
const { chromeCandidates, defaultProfileDir, expandHome } = require("./platform");

assert.deepStrictEqual(chromeCandidates("darwin", {}), [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]);

const windows = chromeCandidates("win32", {
  LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local",
  PROGRAMFILES: "C:\\Program Files",
  "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
});
assert.strictEqual(windows[0], "C:\\Users\\Test\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe");
assert.strictEqual(windows[1], "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe");
assert.strictEqual(windows[2], "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe");

assert.strictEqual(expandHome("~/profile", "/Users/test"), "/Users/test/profile");
assert.strictEqual(defaultProfileDir("/Users/test"), "/Users/test/.xhs-live-chat-sender/chrome-profile");

assert.deepStrictEqual(config.messages, [
  "学习主题包含：日常生活、城市旅行、观点表达、美食探店、个人成长、演讲访谈等",
  "内容已更新250期，每周新增5期，永久有效",
  "点击购物车可以进行全英Vlog精读，支持单句循环、跟读练习、句式解析、字幕下载",
]);
assert(config.messages.every((message) => message.length <= config.maxMessageChars));

console.log(JSON.stringify({ ok: true, platforms: ["darwin", "win32"], defaultMessages: config.messages.length }));
