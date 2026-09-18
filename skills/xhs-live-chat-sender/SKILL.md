---
name: xhs-live-chat-sender
description: 配置、启动、停止和排查小红书千帆直播中控台的本地循环话术发送器。适用于直播话术、循环话术、中控台定时发送与发送审计；不用于商品上下架、开关播或观众账号操作。
---

# 小红书直播循环话术

通过本地 Node.js 脚本和独立 Chrome profile，在 `ark.xiaohongshu.com/live_center_control` 按固定时间网格发送已获用户确认的话术。支持 macOS 与 Windows，运行期不调用模型。

## 边界

- 只操作主播自己的直播中控台消息输入框，不操作商品、直播开关或其他账号。
- 首次启动或话术、账号、频率发生变化时，先向用户展示最终配置并取得明确确认。
- 一次确认覆盖当前配置的持续循环，不要求逐轮确认。用户说“停止”或“暂停”时立即停止。
- 不在发送结果不确定时自动重发；记录 `SEND_UNVERIFIED_NO_RETRY`，避免重复消息。
- 不复制或提交 Cookies、浏览器 profile、日志、PID、状态文件或真实 `xhs_config.json`。

## 安装完成后的引导

技能目录下的运行脚本位于 `scripts/`。

1. 确认平台为 macOS 或 Windows，并检查 Node.js 18+ 与 Google Chrome。
2. 主动告诉用户当前默认间隔为 5 分钟，并逐句展示以下默认话术：

   1. `学习主题包含：日常生活、城市旅行、观点表达、美食探店、个人成长、演讲访谈等`
   2. `内容已更新250期，每周新增5期，永久有效`
   3. `点击购物车可以进行全英Vlog精读，支持单句循环、跟读练习、句式解析、字幕下载`

3. 询问用户是否需要调整。若需要，提示用户直接发送最终话术和间隔；收到后由 agent 自动写入配置，不要求用户手动编辑 JSON。检查每句不超过 40 个字符，超长时明确指出并请用户修改。
4. 获取并确认主播账号名。可从用户提供的中控台截图识别账号和直播状态，但写入前复述确认。
5. 复制 `scripts/xhs_config.example.json` 为 `scripts/xhs_config.json`，自动写入已确认的 `accountName`、`messages` 和间隔。用户不调整话术时保留上述三句默认值。
6. 在 `scripts/` 中运行 `npm install`，再运行 `node check_config.js`；配置检查必须通过后才能启动。
7. 独立 Chrome profile 首次打开后，让用户本人扫码登录。不要索取或展示其凭证。

不要从用户日常 Chrome profile 自动复制 Cookies。默认 profile 与独立调试 profile 的凭证处理应由用户本人完成。

## 启动、停止和状态

仅在用户确认当前配置后启动：

```bash
cd <skill-directory>/scripts
node xhs_daemon.js start --immediate
```

`--immediate` 会立刻发送第一轮；如果用户要求只从下一个时间网格开始，省略它。

```bash
node xhs_daemon.js status
node xhs_daemon.js stop
tail -n 20 xhs_send.log
tail -n 20 xhs_alerts.log
```

Windows PowerShell 查看日志：

```powershell
Get-Content .\xhs_send.log -Tail 20
Get-Content .\xhs_alerts.log -Tail 20
```

启动后检查首轮 `AUDIT`：`issues: []` 且每条 `delta` 为 `1` 才能报告成功。若未开播，`NOT_LIVE_KEEP_CHECKING` 表示安全待机，不代表已发送。

## 配置字段

- `accountName`：必填；发送前核验，避免误发到其他账号。
- `messages`：必填数组；按顺序发送，支持运行中热更新。
- `intervalMinutes`：1–60 分钟，默认 5。
- `toleranceMinutes`：允许的最大延迟；超时跳过，不补发。
- `messageGapMs`：组内句间随机延迟范围。
- `maxMessageChars`：单句上限，默认 40。
- `chromeBinary`：留空时自动查找 macOS 或 Windows 的 Google Chrome；非标准安装位置可手动填写。
- `chromeProfileDir`：独立 Chrome profile，默认在 `~/.xhs-live-chat-sender/`。

## 故障处理

- `ACCOUNT_MISMATCH`：停止，重新确认账号名和当前标签页。
- `INPUT_NOT_EMPTY`：不要覆盖现有输入；让用户清空后再试。
- `SEND_UNVERIFIED_NO_RETRY`：不要重发；先在互动列表人工确认。
- `CDP_CONNECT_FAILED`：检查独立 Chrome 窗口和 9222 端口；脚本不会关闭用户的普通 Chrome。
- `CHROME_BINARY_NOT_FOUND`：Chrome 不在常见位置；把实际可执行文件路径写入 `chromeBinary`。
- `REPEATED_FAILURE_NEEDS_ATTENTION`：停止循环，保留日志并排查。

不要把日志中的页面文本、账号名或话术粘贴到公开 issue；先脱敏。
