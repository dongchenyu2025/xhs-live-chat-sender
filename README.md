# xhs-live-chat-sender

面向 Codex 与兼容 Skill 主机的小红书千帆直播中控台循环话术 Skill。它在 macOS 或 Windows 上使用本地 Node.js 与独立 Chrome profile，按固定时间网格发送经主播确认的话术，并执行账号、直播状态、输入框和发送结果核验。

## 一句话安装

把下面这句话连同链接复制给 Codex：

> 请一键安装并启动这个 Skill：https://github.com/dongchenyu2025/xhs-live-chat-sender/tree/v1.0.2/skills/xhs-live-chat-sender 。安装到 WorkBuddy 后不要进行配置问答，直接读取 `references/runtime-setup.md` 并执行当前系统对应的一键脚本，使用默认三句话术和5分钟间隔。仅在系统要求管理员授权或独立 Chrome 需要扫码登录时提示我操作。

也可以使用 Codex 自带的 skill installer：

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --url https://github.com/dongchenyu2025/xhs-live-chat-sender/tree/v1.0.2/skills/xhs-live-chat-sender
```

仅安装文件后，可直接运行对应的一键脚本：

```bash
# macOS
bash scripts/setup-macos.sh
```

```powershell
# Windows PowerShell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\setup-windows.ps1
```

脚本会自动检测或安装 Node.js、安装依赖、生成默认配置、启动独立 Chrome，并在登录千帆后自动识别主播账号。无需与 AI 逐项确认配置。

默认话术：

1. `学习主题包含：日常生活、城市旅行、观点表达、美食探店、个人成长、演讲访谈等`
2. `内容已更新250期，每周新增5期，永久有效`
3. `点击购物车可以进行全英Vlog精读，支持单句循环、跟读练习、句式解析、字幕下载`

## 环境

- macOS 或 Windows 10/11
- Google Chrome
- Node.js 18+（缺失或版本过低时由一键脚本自动安装）
- 可登录的小红书千帆主播账号

仓库 CI 会分别在 macOS 与 Windows runner 上执行依赖安装、平台路径测试和脚本语法检查。

## 安全设计

- 真实配置、Cookies、Chrome profile、日志、PID 和运行状态不会进入仓库。
- 账号不匹配、未开播或输入框非空时不会发送。
- 结果不确定时不会盲目重发，避免重复话术。
- 脚本只管理自己的独立 Chrome 实例，不关闭用户的普通 Chrome。
- “停止”或“暂停”会终止循环。

请自行确认自动化使用方式符合你的账号权限和平台规则。

## 仓库结构

```text
skills/xhs-live-chat-sender/
├── SKILL.md
└── scripts/
    ├── check_config.js
    ├── package.json
    ├── platform.js
    ├── setup-macos.sh
    ├── setup-windows.ps1
    ├── test_platform.js
    ├── xhs_config.example.json
    ├── xhs_daemon.js
    └── xhs_sender.js
```

## License

MIT
