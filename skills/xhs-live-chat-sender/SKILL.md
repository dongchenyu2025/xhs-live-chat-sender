---
name: xhs-live-chat-sender
description: 配置、启动、停止和排查小红书千帆直播中控台的本地循环话术发送器。适用于直播话术、循环话术、中控台定时发送与发送审计；不用于商品上下架、开关播或观众账号操作。
---

# 小红书直播循环话术

通过本地 Node.js 脚本和独立 Chrome profile，在 `ark.xiaohongshu.com/live_center_control` 按固定时间网格发送已获用户确认的话术。支持 macOS 与 Windows，运行期不调用模型。

## 边界

- 只操作主播自己的直播中控台消息输入框，不操作商品、直播开关或其他账号。
- 用户明确要求“一键安装并启动”时，该指令授权使用默认三句话术和 5 分钟间隔启动；不要再进行逐项问答。
- 一次确认覆盖当前配置的持续循环，不要求逐轮确认。用户说“停止”或“暂停”时立即停止。
- 不在发送结果不确定时自动重发；记录 `SEND_UNVERIFIED_NO_RETRY`，避免重复消息。
- 不复制或提交 Cookies、浏览器 profile、日志、PID、状态文件或真实 `xhs_config.json`。

## 一键安装与首次启动

技能目录下的运行脚本位于 `scripts/`。

收到明确的一键安装并启动请求后，读取 [references/runtime-setup.md](references/runtime-setup.md)，直接执行当前系统对应的安装脚本。不要要求用户提供账号、逐句确认话术或手动编辑 JSON。

脚本会自动检测或安装 Node.js、安装依赖、生成配置并启动独立 Chrome。默认间隔为 5 分钟，默认话术为：

   1. `学习主题包含：日常生活、城市旅行、观点表达、美食探店、个人成长、演讲访谈等`
   2. `内容已更新250期，每周新增5期，永久有效`
   3. `点击购物车可以进行全英Vlog精读，支持单句循环、跟读练习、句式解析、字幕下载`

首次打开独立 Chrome 后，用户只需完成扫码登录。发送器会从千帆页面自动识别主播账号并写回配置；识别失败时停止发送并记录 `ACCOUNT_DETECTION_FAILED`，不得猜测账号。

系统管理员授权、UAC、密码输入和小红书扫码必须由用户本人完成。除此之外不发起配置对话。安装结果只需汇报成功，或给出一个可操作的真实失败原因。

不要从用户日常 Chrome profile 自动复制 Cookies。默认 profile 与独立调试 profile 的凭证处理应由用户本人完成。

## 启动、停止和状态

一键脚本会自动启动。已有安装也可直接运行：

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

- `accountName`：首次可留空并自动识别；识别后必填，用于每轮发送前核验。
- `autoDetectAccount`：首次默认为 `true`；从千帆页面识别账号后自动改为 `false`。
- `messages`：必填数组；按顺序发送，支持运行中热更新。
- `intervalMinutes`：1–60 分钟，默认 5。
- `toleranceMinutes`：允许的最大延迟；超时跳过，不补发。
- `messageGapMs`：组内句间随机延迟范围。
- `maxMessageChars`：单句上限，默认 40。
- `chromeBinary`：留空时自动查找 macOS 或 Windows 的 Google Chrome；非标准安装位置可手动填写。
- `chromeProfileDir`：独立 Chrome profile，默认在 `~/.xhs-live-chat-sender/`。

## 故障处理

- `ACCOUNT_MISMATCH`：停止，重新确认账号名和当前标签页。
- `ACCOUNT_DETECTION_FAILED`：无法从页面安全识别主播账号；停止发送，不猜测、不绕过核验。
- `INPUT_NOT_EMPTY`：不要覆盖现有输入；让用户清空后再试。
- `SEND_UNVERIFIED_NO_RETRY`：不要重发；先在互动列表人工确认。
- `CDP_CONNECT_FAILED`：检查独立 Chrome 窗口和 9222 端口；脚本不会关闭用户的普通 Chrome。
- `CHROME_BINARY_NOT_FOUND`：Chrome 不在常见位置；把实际可执行文件路径写入 `chromeBinary`。
- `REPEATED_FAILURE_NEEDS_ATTENTION`：停止循环，保留日志并排查。

不要把日志中的页面文本、账号名或话术粘贴到公开 issue；先脱敏。
