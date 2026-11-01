# 开源参考与组件

应用图标与托盘图标为本项目独立绘制的“日历＋提醒铃铛”矢量图形，源文件位于assets/app.svg、assets/tray.svg，没有使用外部人物、桌宠或其他项目的图像素材。

设计参考（没有复制其代码）：
- Todue：https://github.com/corbinlazarone/todue （MIT）：上传、审核、确认流程。
- qq-live-digest：https://github.com/wc985732-lang/qq-live-digest （MIT）：候选、来源和提醒状态。

主要运行组件及许可证：React/React DOM（MIT），FullCalendar Standard React（MIT），better-sqlite3（MIT），PDF.js/pdfjs-dist（Apache-2.0），Nodemailer（MIT），adm-zip（MIT），Electron（MIT，包含Chromium及其他组件）。实际版本以package-lock.json为准。

各组件原始版权及许可证保存在安装包的node_modules及Electron附带的LICENSE/第三方许可证文件中。生成的前端静态文件保留上游许可证注释。完整依赖版权汇总见DEPENDENCY_LICENSES.txt。

外部服务：DeepSeek API（使用者自行配置Key）、使用者指定的SMTP服务，均不属于离线开源组件。网络请求仅由用户选择的识别或邮件功能发起。

开发过程采用社区维护的karpathy-guidelines：https://github.com/multica-ai/andrej-karpathy-skills 。它不是Karpathy本人发布的仓库，不是应用运行依赖。
