const fs = require("fs");
const os = require("os");
const path = require("path");

function expandHome(value, home = os.homedir()) {
  const text = String(value || "").trim();
  if (text === "~") return home;
  if (text.startsWith("~/") || text.startsWith("~\\")) return path.join(home, text.slice(2));
  return text;
}

function chromeCandidates(platform = process.platform, env = process.env) {
  if (platform === "darwin") {
    return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  }
  if (platform === "win32") {
    return [
      env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
      env.PROGRAMFILES && path.win32.join(env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      env["PROGRAMFILES(X86)"] && path.win32.join(env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
    ].filter(Boolean);
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"];
}

function resolveChromeBinary(configured, options = {}) {
  const explicit = expandHome(configured, options.home);
  if (explicit) return explicit;
  const candidates = chromeCandidates(options.platform, options.env);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0] || "";
}

function defaultProfileDir(home = os.homedir()) {
  return path.join(home, ".xhs-live-chat-sender", "chrome-profile");
}

module.exports = { chromeCandidates, defaultProfileDir, expandHome, resolveChromeBinary };
