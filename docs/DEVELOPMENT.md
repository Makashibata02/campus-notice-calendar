# 开发与验证

Electron主进程持有SQLite、凭据、材料读取、模型与SMTP请求；React界面只通过preload暴露的业务接口访问。项目不运行本地HTTP后端服务。

- `desktop/`：数据规则、主进程、来源读取、帮助和受限通信。
- `src/`：React五个页面、共享界面、类型与样式。
- `tests/`：确定性规则测试；`scripts/test.cjs`用Electron内置Node匹配SQLite ABI。
- `materials/`：32份明确标记的合成材料、作者源文件、参考结果。
- `assets/`：独立绘制的日历与铃铛图标。

依赖版本锁定在package-lock.json。完整构建命令见README。不要在普通Node进程直接运行需要Electron ABI的better-sqlite3测试。

## 界面检查

先 `npm run build`，再分别运行：

```powershell
node scripts/v030-ui-check.cjs
node scripts/v030-secondary-check.cjs
node scripts/link-ui-check.cjs
node scripts/v030-import-check.cjs
```

这些脚本使用隔离的 `runtime-test/` 资料目录与本地模拟服务，报告写入 `validation/`，不会替用户确认个人候选或发送真实邮件。Electron启动失败应检查本机权限、杀毒软件和图形环境。模拟请求只验证程序行为，不证明模型准确率。

重新生成合成材料：`npx electron scripts/materials.cjs`。生成结果会覆盖materials中的合成文件。

公开源码不含开发者的安装目录、真实服务验收脚本、私人通知、个人截图、应用数据库、原始日志、凭据或参赛资料。单独的本机历史记录没有进入此仓库。
