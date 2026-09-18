# 一键运行环境安装

首次安装后不要通过多轮对话收集配置。用户明确要求安装并启动时，直接执行与操作系统对应的一键脚本：

- macOS：`bash scripts/setup-macos.sh`
- Windows PowerShell：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\setup-windows.ps1`

脚本会依次完成：

1. 检查 Node.js 18+ 与 npm。
2. 缺失或版本过低时，通过系统包管理器安装 Node.js。
3. 用锁文件安装运行依赖。
4. 首次运行时从示例生成默认配置，不覆盖已有配置。
5. 启动本地发送器和独立 Chrome。

macOS 使用 Homebrew；若 Homebrew 缺失，脚本从 Homebrew 官方安装地址安装。Windows 使用 WinGet 的 `OpenJS.NodeJS.LTS` 包。系统的管理员授权、UAC 或密码窗口由用户本人确认，这不是对话式配置。

脚本失败时停止，不继续启动发送器。报告原始错误和可重新运行的同一条命令，不临时切换到非官方镜像。
