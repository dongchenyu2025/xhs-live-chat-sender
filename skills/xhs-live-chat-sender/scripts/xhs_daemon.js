#!/usr/bin/env node
const { spawn } = require("child_process");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const SENDER = path.join(DIR, "xhs_sender.js");
const PID_FILE = path.join(DIR, "xhs_sender.pid");
const OUT_FILE = path.join(DIR, "xhs_sender.out.log");

function readPid() {
  try { return Number(fs.readFileSync(PID_FILE, "utf8").trim()) || 0; } catch { return 0; }
}

function isAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function isManagedProcess(pid) {
  if (!isAlive(pid)) return false;
  try {
    const command = process.platform === "win32"
      ? execFileSync("powershell.exe", [
          "-NoProfile", "-NonInteractive", "-Command",
          `(Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\").CommandLine`,
        ], { encoding: "utf8", windowsHide: true })
      : execFileSync("/bin/ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" });
    return command.includes("xhs_sender.js");
  } catch { return false; }
}

function status() {
  const pid = readPid();
  const alive = isManagedProcess(pid);
  console.log(JSON.stringify({ running: alive, pid: alive ? pid : null }));
  return alive;
}

function stop() {
  const pid = readPid();
  if (!isManagedProcess(pid)) {
    try { fs.unlinkSync(PID_FILE); } catch {}
    console.log("not running");
    return;
  }
  process.kill(pid, "SIGTERM");
  console.log(`stop requested for pid ${pid}`);
}

function start(immediate) {
  if (status()) {
    console.error("already running");
    process.exitCode = 1;
    return;
  }
  const fd = fs.openSync(OUT_FILE, "a");
  const senderArgs = [SENDER];
  if (immediate) senderArgs.push("--immediate");
  const useCaffeinate = process.platform === "darwin" && fs.existsSync("/usr/bin/caffeinate");
  const command = useCaffeinate ? "/usr/bin/caffeinate" : process.execPath;
  const commandArgs = useCaffeinate ? ["-i", process.execPath, ...senderArgs] : senderArgs;
  const child = spawn(command, commandArgs, {
    cwd: DIR,
    detached: true,
    stdio: ["ignore", fd, fd],
    env: process.env,
  });
  child.unref();
  fs.closeSync(fd);
  console.log(`started pid ${child.pid}${immediate ? " (immediate)" : ""}`);
}

const [command = "status", ...args] = process.argv.slice(2);
if (command === "start") start(args.includes("--immediate"));
else if (command === "stop") stop();
else if (command === "status") process.exitCode = status() ? 0 : 1;
else {
  console.error("usage: node xhs_daemon.js start [--immediate] | stop | status");
  process.exitCode = 2;
}
