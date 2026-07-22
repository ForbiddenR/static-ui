# Bot 自动化任务平台 V1：MVP 范围

> [本文件角色]
> 本文件只决定第一版实施范围、简化实现、暂不实施项和推荐里程碑，不重新定义资源、状态、接口、消息或数据表语义。
> 列入 MVP 的能力按对应权威规范实现；共享导航和规范优先级见 [文档目录.md](文档目录.md#document-guide)。

## 快速导航

[MVP 范围](#mvp-scope) · [Bot](Bot规范.md#bot-model) · [Task](Task执行规范.md#task-model) · [Worker](Worker协议与运行时.md#worker-protocol) · [Schedule](Schedule调度规范.md#schedule-api) · [输出资源](结果-产物-日志.md#result-artifact-log-api)

<a id="mvp-scope"></a>
## 第一版 MVP 范围裁剪

> [范围规则]
> 本节只表达“实现、简化实现或暂不实现”。字段、枚举、状态迁移、错误语义、协议 payload 和持久化约束均回到权威文档；MVP 摘要不得反向修改完整契约。

### MVP 必须实现

| 能力组 | 第一版范围 | 权威来源 |
|---|---|---|
| Bot 与脚本版本 | Source File 脚本包上传；Bot 基础管理；BotVersion 创建、查询和发布 | [Bot 规范](Bot规范.md#bot-api)、[Source File](./源文件.md#source-file-api) |
| Task 执行 | Task 创建、查询、取消、重试、重新执行、恢复派发；Task 终态裁定 | [Task API](Task执行规范.md#task-api)、[Task 状态机](Task执行规范.md#task-status) |
| 调度与 Worker | Task 队列、Worker 匹配、容量预约、派发握手、deadline、派发前回收与 fencing | [Worker 调度](Worker协议与运行时.md#worker-dispatch)、[Worker 协议](Worker协议与运行时.md#worker-protocol) |
| Worker 运行闭环 | gRPC 双向 Streaming、重连对账、Worker 管理 REST、本机 Runtime 和 Python SDK 基础能力 | [Worker 协议与运行时](Worker协议与运行时.md#worker-protocol) |
| 业务明细与输出 | TaskItem 上报与查询；Result 保存与查询；Artifact 保存与下载；Log 查询与 SSE | [TaskItem API](Task执行规范.md#task-item-api)、[Result / Artifact / Log](结果-产物-日志.md#result-artifact-log-api) |
| 定时触发 | Schedule / ScheduleRun 基础能力 | [Schedule 规范](Schedule调度规范.md#schedule-api) |
| 存储与审计 | 各主题 MVP 所需数据表及 `task_events` | [持久化归属](文档目录.md#persistence-map) |
| 验收 | 正常闭环、取消、超时、重试、调度竞态、fencing 和输出访问路径 | [流程图与验收材料](流程图与讨论材料.md#acceptance-walkthrough)及各权威规范 |

### 简化实现

```text
Master 单实例
script_source 只支持 upload
storage_backend 只支持 local
Schedule overlap_policy 重点实现 skip；非 MVP overlap / missed-run 组合语义由 [ALIGN-008](待对齐问题.md#align-008) 跟踪
missed_run_policy 默认 skip（可选配置 run_once）
BotVersion 采用 draft / published + 单一 current version + publish 接口
权限先做基础用户 / 管理员
日志先入库，不接 Loki / OpenSearch
SDK notify / secrets 只预留
```

这些是实施裁剪，不补充或覆盖对应主题中的字段和行为定义。

### 暂不实现

```text
TaskItem 级调度
动态拉镜像
动态创建容器
多 Master 高可用
对象存储
完整通知系统
完整密钥系统
DAG 工作流
复杂权限系统
Schedule queue / replace / parallel 的完整行为
Result 高级导出
```

### 推荐里程碑

#### 里程碑 1：资源基础与创建链路

- 建立 Bot、BotVersion、Task、Source File 的最小持久化和 API 闭环。
- 完成脚本包与 Task 输入文件上传、版本发布和 Task 创建。
- 建立 BotVersion 当前版本一致性和 Task 状态机测试。

权威来源：[Bot 规范](Bot规范.md#bot-api)、[Task API](Task执行规范.md#task-api)、[Source File](./源文件.md#source-file-api)。

#### 里程碑 2：Worker 执行与派发闭环

- 完成 Worker 连接、派发握手、脚本启动、日志采集和结束上报。
- 完成 Worker 管理 REST、容量预约、deadline、重连对账和竞态测试。

权威来源：[Worker 协议](Worker协议与运行时.md#worker-protocol)、[Worker 调度](Worker协议与运行时.md#worker-dispatch)。

#### 里程碑 3：SDK、TaskItem 与结构化输出

- 完成本机 Runtime、Python SDK、TaskItem、Result 和 Log 基础链路。
- 完成 TaskItem 统计与前端实时日志接入。

权威来源：[Runtime / SDK](Worker协议与运行时.md#runtime-sdk)、[TaskItem API](Task执行规范.md#task-item-api)、[输出资源](结果-产物-日志.md#result-artifact-log-api)。

#### 里程碑 4：停止与再次执行

- 完成取消、重试、重新执行和相关可操作性判断。
- 验证原 Task 保持可追溯，新执行创建新 Task。

权威来源：[Task API](Task执行规范.md#task-api)、[Task 状态机](Task执行规范.md#task-status)。

#### 里程碑 5：定时触发与文件产物

- 完成 Schedule / ScheduleRun 基础版。
- 完成 Artifact 下载和本地存储闭环。

权威来源：[Schedule 规范](Schedule调度规范.md#schedule-api)、[Artifact API](结果-产物-日志.md#artifact-api)。
