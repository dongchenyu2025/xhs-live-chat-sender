# xhs-live-chat-sender

面向 Codex 的小红书千帆直播中控台循环话术 Skill。它使用本地 Node.js 与独立 Chrome profile，按固定时间网格发送经主播确认的话术，并执行账号、直播状态、输入框和发送结果核验。

## 一句话安装

把下面这句话连同链接复制给 Codex：

> 请安装这个 Skill：https://github.com/dongchenyu2025/xhs-live-chat-sender/tree/main/skills/xhs-live-chat-sender

也可以使用 Codex 自带的 skill installer：

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --url https://github.com/dongchenyu2025/xhs-live-chat-sender/tree/main/skills/xhs-live-chat-sender
```

安装后，在下一轮对话中说：

> 帮我配置小红书直播循环话术

Codex 会引导你确认主播账号、话术和发送间隔，安装本地依赖并检查配置。真正启动循环前仍会请求一次明确确认。

## 环境

- macOS
- Google Chrome
- Node.js 18+
- 可登录的小红书千帆主播账号

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
    ├── xhs_config.example.json
    ├── xhs_daemon.js
    └── xhs_sender.js
```

## License

MIT
