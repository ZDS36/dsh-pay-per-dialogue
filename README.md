# DSH 用量与余额

在 DeepSeek Harness（DSH）的对话输入框下方查看钱包余额和本会话的估算费用，在侧栏查看工作区合计。插件基于 DSH 已有的用量数据计算人民币费用，实际扣费以 DeepSeek 平台账单为准。

## 界面

| 位置 | 显示内容 |
| --- | --- |
| 输入框下方 | 钱包余额、本会话估算费用。点击可查看赠送余额、会话和项目费用、模型、单价版本及更新时间，也可以手动刷新。 |
| 左侧工作区和会话列表 | 悬停在工作区行可查看项目合计，悬停在会话行可查看该会话及所属项目的估算费用。 |
| 右侧「文件」页签 | 显示当前项目合计，点击可展开明细。 |

## 安装

此插件在 DSH 客户端的 Web 界面中运行。需要 Git，以及当前 DSH profile 使用的 Node.js 和 pnpm。

1. 克隆仓库。

   ```powershell
   git clone https://github.com/ZDS36/dsh-pay-per-dialogue.git
   ```

2. 找到 DSH 当前 profile（常见路径为 `~/.dsh/profiles/<profile>/`），备份其中的 `package.json`。将下面两项合并到该文件，保留已有依赖和插件条目。把示例里的路径换成实际克隆目录。

   ```json
   {
     "dependencies": {
       "@local/dsh-usage-cost": "link:D:/plugins/dsh-pay-per-dialogue"
     },
     "dsh": {
       "profile": {
         "bundles": ["@local/dsh-usage-cost"]
       }
     }
   }
   ```

3. 在 **profile 目录**运行 `pnpm install`，退出并重新打开 DSH。在「设置 → 插件」中确认「用量与余额」已启用。钱包余额需要登录 DeepSeek 账号。

已经安装 `@local/dsh-usage-cost` 时，可更新现有路径或调整 `link:` 指向新目录，沿用同一个插件条目。

## 费用怎么算

- 插件将未缓存输入、缓存读取、缓存写入和输出四类用量分别换算为百万 Token，乘以对应单价后求和。内置表覆盖 Flash 和 V4 Pro，缓存写入按未缓存输入价估算。
- 内置表版本为 `2026-10-19`。插件把北京时间周一至周五的 09:00–12:00、14:00–18:00 归为高峰，周末、内置的 2026 年节假日及其余时段归为空闲。请以平台当前价格为准。 [DeepSeek 模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
- 首次读取历史会话时，插件用会话最后活动时间为聚合用量定价。打开的会话收到新用量时，按观察到增量的时间估算。跨时段、切换模型或从旧会话分叉时，估算可能与账单有差异。工作区合计可能包含分叉会话继承的用量。
- 浏览器会保留已记录的累计费用。更新内置价格表后，新观察到的用量使用新价格。清除 DSH 的站点数据后，历史会话会按当时安装的价格表重新估算。

## 隐私与数据

- 余额通过 DSH 自带的账户接口读取，费用使用 DSH 的会话用量和模型字段计算。插件复用 DSH 的登录状态，无需填写 API Key，也不发起模型请求。
- 浏览器的 `localStorage` 保存一份计费账本，记录会话 ID、模型、累计 Token 数、估算费用、时间及单价版本。工作区路径仅在内存中用于归类。插件不读取对话正文，也没有遥测上传功能。

## 兼容性与卸载

插件依赖 DSH 的账户与会话接口、客户端插槽，以及左侧工作区行的 `data-row-key` 属性。DSH 更新后，如果属性或插槽发生变化，对应的展示位置可能需要适配。

在「设置 → 插件」中可以停用插件。要卸载，从当前 profile 的 `dependencies` 和 `dsh.profile.bundles` 中移除 `@local/dsh-usage-cost`，在 profile 目录运行 `pnpm install` 后重启 DSH。

可在源码目录运行 `node --check client.js` 和 `node --check index.js` 检查语法。
