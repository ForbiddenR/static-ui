# JobOps V1：Workers

Worker 是实际执行 Task 的执行节点：它主动通过 gRPC 双向流连接 Master，上报心跳、容量和运行报告，并接收派发、取消等指令。管理页面可以查看每个 Worker 的在线状态、主机名、支持的 runtime 和能力标签、当前负载与空闲槽位、最近心跳时间，以及禁用 / 启用调度；其中最重要的参数是 `max_concurrency`（最大并发 Task 数）和心跳间隔 / 超时（默认 5 秒上报、15 秒未上报判定离线），它们直接决定调度分配和故障检测。Worker 本机的 Runtime 与 Python SDK 负责启动脚本进程并把 TaskItem、Result、Artifact、Log 汇聚上报给 Master。

> [本文件角色]
> 本文件定义 Worker 控制面、gRPC 双向 Streaming、Master 调度与容量预约、assignment fencing、离线重连、Worker 管理 REST 以及本机 Runtime / Python SDK。Task 状态和输出资源语义分别以 [Task执行规范.md](Task执行规范.md#task-status) 与 [结果-产物-日志.md](结果-产物-日志.md#result-artifact-log-api) 为准。
> 本文件中的完整定义是对应主题的唯一规范来源；其他文档只保留摘要、传输映射或存储映射，并通过链接回到本文件。

## 快速导航

[Worker 协议](#worker-protocol) · [Worker 调度](#worker-dispatch) · [Worker Pool](#worker-pool) · [Worker 管理 REST](#worker-rest-api) · [Runtime / SDK](#runtime-sdk) · [持久化映射](#persistence-map)

<a id="worker-protocol"></a>
## Worker 控制面通信协议定稿

> [本节角色]
> [Worker 协议](Worker协议与运行时.md#worker-protocol) 是 Master 与 Worker gRPC 消息、会话、幂等和 fencing 的字段级权威契约；[Worker 管理 REST](Worker协议与运行时.md#worker-rest-api) 是 Worker 管理 REST 契约。消息中的状态和统计字段必须服从 [Task 状态机](Task执行规范.md#task-status)～[统计规则](Task执行规范.md#task-statistics)，不由协议层重新裁定业务语义。

本节同时定稿两件事：

```text
1. Master <-> Worker 的 gRPC 双向 Streaming 控制面
2. 面向前端 / 运维的 Worker 管理 REST API
```

第一版控制面采用：

```text
Master <-> Worker：gRPC 双向 Streaming
```

Worker 主动连接 Master：

```text
Worker -> Master: Connect()
```

Master 不主动连接 Worker，Worker 不需要暴露调度端口。

核心服务：

```proto
service WorkerControlService {
  rpc Connect(stream WorkerMessage) returns (stream MasterMessage);
}

// 第一版逻辑结构（字段级契约见下文；实现可用 protobuf / JSON over gRPC）
message WorkerMessage {
  string message_id = 1;          // 必填，Worker 侧生成，用于去重
  string worker_id = 2;           // 必填
  string session_id = 3;          // 必填，本次 Connect 会话
  int64  sent_at_unix_ms = 4;     // 必填，发送时间
  oneof body {
    Hello hello = 10;
    Heartbeat heartbeat = 11;
    TaskAck task_ack = 12;
    TaskStarted task_started = 13;
    TaskFinished task_finished = 14;
    TaskFailed task_failed = 15;
    CancelResult cancel_result = 16;
    LogBatch log_batch = 17;
    RuntimeReportBatch runtime_report_batch = 18; // TaskItem / Result / Artifact / 统计增量
  }
}

message MasterMessage {
  string message_id = 1;          // 必填，Master 侧生成
  string worker_id = 2;           // 必填
  string session_id = 3;          // 必填，目标会话；不匹配则 Worker 忽略
  int64  sent_at_unix_ms = 4;     // 必填
  oneof body {
    Welcome welcome = 10;
    AssignTask assign_task = 11;
    CancelTask cancel_task = 12;
    Ping ping = 13;
    AbortAssignment abort_assignment = 14;
  }
}
```

通用信封字段（所有消息都有）：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `message_id` | string | 是 | 消息唯一 ID；接收方按 ID 去重 |
| `worker_id` | string | 是 | Worker ID |
| `session_id` | string | 是 | 当前 gRPC 会话 ID |
| `sent_at_unix_ms` | int64 | 是 | 发送方时间戳（毫秒） |

与 Task 相关的上报还必须携带：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 是 | 本次派发 ID；Master 只接受当前 assignment |
| `task_id` | string | 是 | Task ID |

<a id="worker-to-master-messages"></a>
### Worker -> Master 消息

第一版消息：

```text
Hello
Heartbeat
TaskAck
TaskStarted
TaskFinished
TaskFailed
CancelResult
LogBatch
RuntimeReportBatch
```

<a id="hello-message"></a>
#### Hello

连接建立后的第一条业务消息，用于注册 / 重连声明能力。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `worker_name` | string | 是 | 展示名 |
| `hostname` | string | 是 | 主机名 |
| `version` | string | 是 | Worker 进程版本 |
| `runtimes` | array<string> | 是 | 支持的 runtime，例如 `["python3.12"]` |
| `images` | array<string> | 否 | 支持的镜像列表 |
| `capabilities` | array<string> | 是 | 能力列表 |
| `labels` | map<string,string> | 否 | 调度标签 |
| `max_concurrency` | integer | 是 | 最大并发，必须 `>= 1` |
| `running_tasks` | array<RunningTaskRef> | 是 | 重连时对账用；首次连接可为空数组 |
| `auth_token` | string | 是 | worker_token / shared_secret；仅 Hello 携带，后续消息依赖已认证 session |

`RunningTaskRef`：

> [本节角色]
> `RunningTaskRef.local_status` 描述 Worker 本地进程阶段，不属于 `Task.status`，不得按 [Task 状态机](Task执行规范.md#task-status) 的 Task 状态枚举直接解释或持久化回写。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `task_id` | string | 是 | Task ID |
| `assignment_id` | string | 是 | 派发 ID |
| `local_status` | string | 是 | Worker 本地状态：`starting` / `running` / `canceling` / `finishing` |
| `started_at` | string | 否 | 本地开始时间，RFC3339 |

Master 处理：

```text
校验 auth_token
创建或更新 workers 行
session_id 绑定当前 stream
用 running_tasks 与 Master 侧 assignment 对账
回复 Welcome
```

<a id="heartbeat-message"></a>
#### Heartbeat

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `current_running` | integer | 是 | 当前运行中 Task 数 |
| `free_slots` | integer | 是 | 空闲槽位 |
| `running_tasks` | array<RunningTaskRef> | 是 | 当前运行任务快照 |
| `metrics` | object | 否 | 可选，如 `{"cpu_percent":12.5,"memory_mb":512}` |

建议间隔：`5s`；Master 超时建议：`15s` 无心跳则视为 offline（具体值可配置）。

`current_running`、`free_slots`、`running_tasks` 是同一 Heartbeat 快照，Worker 应尽量一致生成。Master 将 Heartbeat 视为容量快照输入，而不是容量权威：

```text
不得仅凭 free_slots 释放 Master 已建立的 dispatch reservation
三个容量字段冲突时取最保守结果，并记录 HEARTBEAT_CAPACITY_CONFLICT
Heartbeat 不直接修改 Task 的 dispatching / running 状态
Worker 若发现 assignment 已过 start_deadline_at、收到 AbortAssignment，
或对账未获得 keep / continue 许可，必须停止或禁止启动，并在后续 Heartbeat 中移除该项
```

完整容量模型见 [Worker 协议](Worker协议与运行时.md#worker-protocol)。

<a id="task-ack-message"></a>
#### TaskAck

Worker 收到 `AssignTask` 后的确认。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 是 | 与 AssignTask 一致 |
| `task_id` | string | 是 | Task ID |
| `accepted` | boolean | 是 | 是否接受执行 |
| `reject_reason` | string | 否 | `accepted=false` 时必填；协议原因码见 [错误标识注册表](错误标识注册表.md#error-registry) 表 C，例如 `NO_FREE_SLOT` / `RUNTIME_NOT_SUPPORTED` / `WORKER_DISABLED`；不是 Task 执行错误码 |

Master 只接受同时满足以下条件的 TaskAck：

```text
当前 session_id
当前 worker_id
当前 assignment_id
Task.status = dispatching
ack_deadline_at 未到期
```

处理规则：

| 结果 | Master 动作 |
|---|---|
| `accepted=true` | 写 `assignment_acked_at=now` 与 `TASK_ACK_ACCEPTED`；状态保持 `dispatching`；reservation 继续占用；等待 `TaskStarted` |
| `accepted=false` 且 `reject_reason=NO_FREE_SLOT` | 原子回收 assignment，回 `pending`，设置退避；当前派发轮排除该 Worker，等待新 Heartbeat |
| `accepted=false` 且 `reject_reason=RUNTIME_NOT_SUPPORTED` | 同上，并记录匹配/能力快照不一致；能力声明变化前不再把该 Worker 作为本 Task 候选 |
| `accepted=false` 且 `reject_reason=WORKER_DISABLED` | 同上；Worker enable 前不可再成为候选 |
| `accepted=false` 且未登记/空原因 | 同上，写 `UNKNOWN_TASK_ACK_REJECTION` 诊断，并对该 Worker 短暂冷却 |

共同约束：

```text
任何合法 accepted=false 都不会写 Task.error_code，不会进入 failed，不会创建新 Task
回收事务必须先使旧 assignment 失效并释放 reservation，再按本文件的 Worker 调度规则重新入队
重复 TaskAck 幂等返回当前结果，不重复递增 attempt 或重复写业务副作用
迟到或旧 assignment 的 TaskAck 因 fencing 丢弃
```

重新入队、退避与派发尝试见 [Worker 调度规则](#worker-dispatch)。

<a id="task-started-message"></a>
#### TaskStarted

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 是 | 派发 ID |
| `task_id` | string | 是 | Task ID |
| `started_at` | string | 是 | 脚本进程真正启动时间，RFC3339 |
| `pid` | integer | 否 | 本地进程 PID，仅调试 |
| `runtime` | string | 否 | 实际使用的 runtime |
| `work_dir` | string | 否 | Worker 本地工作目录，不回传给前端 |

Master 只有在以下条件全部成立时，才允许原子处理 TaskStarted：

```text
当前 session_id / worker_id / assignment_id
Task.status = dispatching
assignment_acked_at 已设置
start_deadline_at 未到期
```

成功处理：

```text
Task.status = running
Task.started_at = started_at
Task.worker_id / assignment_id 保持
清除 ack_deadline_at / start_deadline_at 的派发阶段约束
dispatch reservation 转为 running 占用
```

若不满足条件：

```text
丢弃该 TaskStarted
要求 Worker abort 该 assignment
不得把 canceling、pending 或已终态 Task 改回 running
```

<a id="task-finished-message"></a>
#### TaskFinished

> [重复摘要｜非规范性]
> 本消息传递完成事实和辅助统计，不建立第二套终态规则。Master 必须按 [Task 状态机](Task执行规范.md#task-status) 裁定 `Task.status`，按 [Task 状态机](Task执行规范.md#task-status) 处理统计来源与冲突，并使用 [统计规则](Task执行规范.md#task-statistics) 的统计字段定义。

脚本进程正常结束（有 exit code）后上报。业务成功/部分成功/业务失败都走本消息；由 Master 结合 exit code 与 TaskItem 统计裁定最终状态。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 是 | 派发 ID |
| `task_id` | string | 是 | Task ID |
| `exit_code` | integer | 是 | 进程退出码 |
| `finished_at` | string | 是 | 结束时间，RFC3339 |
| `suggested_status` | string | 否 | Worker/SDK 建议：`success` / `partial_success` / `failed`；Master 可覆盖 |
| `summary` | object | 否 | 脚本摘要 |
| `statistics` | object | 否 | TaskItem 统计快照；若运行中已通过 RuntimeReportBatch 增量同步，可省略或作为最终校准 |
| `error_code` | string | 否 | Task 执行错误码，取值及兼容规则见 [错误标识注册表](错误标识注册表.md#error-registry) 表 B；不是 REST `error.code` |
| `error_message` | string | 否 | 面向用户的错误说明，必须脱敏 |
| `error_detail` | object | 否 | 调试详情，Master 入库前按 [安全基线](安全基线.md#security-baseline) 脱敏 |

Master 将 `TaskFinished` 作为“进程已结束、存在 exit code”的传输事实；最终状态必须遵循 [Task 最终状态裁定规则](Task执行规范.md#task-terminal-arbitration)，统计冲突按 [统计来源与冲突处理](Task执行规范.md#task-statistics-conflict) 处理：

```text
用户取消 > 整体超时 > Worker/脚本异常 > TaskItem 统计
Master 数据库 TaskItem 聚合 > Worker 上报 statistics / suggested_status
已持久化 canceled / timeout 或其他终态时，不得由 TaskFinished 覆盖
```

<a id="task-failed-message"></a>
#### TaskFailed

> [重复摘要｜非规范性]
> 本消息描述 Worker / Runtime 异常事实；Task 最终状态、终态竞争和迟到消息处理以 [Task 状态机](Task执行规范.md#task-status) 为准。

任务未能正常跑完进程生命周期时上报（拉起失败、运行时崩溃且无干净 exit、本地准备失败等）。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 是 | 派发 ID |
| `task_id` | string | 是 | Task ID |
| `failed_at` | string | 是 | 失败时间，RFC3339 |
| `error_code` | string | 是 | Task 执行错误码，注册及未知值兼容规则见 [错误标识注册表](错误标识注册表.md#error-registry) 表 B，例如 `SCRIPT_START_FAILED` / `RUNTIME_CRASH` / `INPUT_DOWNLOAD_FAILED` |
| `error_message` | string | 是 | 简短说明，必须脱敏 |
| `error_detail` | object | 否 | 调试详情，Master 入库前按 [安全基线](安全基线.md#security-baseline) 脱敏 |
| `retriable` | boolean | 否 | Worker 对异常可恢复性的建议；第一版只记录，不自动改派，也不改变 [Task API](Task执行规范.md#task-api) 的人工 retry 资格 |

Master 处理：

1. 先校验当前 `session_id`、`worker_id`、`assignment_id` 与消息前置状态。
2. 将 TaskFailed 作为 Worker / Runtime 异常事实，并把 `error_*` 与 `retriable` 作为终态裁定输入和诊断信息。
3. 必须交由 [Task 最终状态裁定规则](Task执行规范.md#task-terminal-arbitration) 处理取消、整体超时、已有终态以及并发终态消息；协议层不得直接用 `Task.status = failed` 覆盖已经持久化的 `canceled`、`timeout` 或其他终态裁决。
4. 未终态 TaskItem 的收敛方式不由 TaskFailed 消息单独决定，继续遵守 [TaskItem 状态机](Task执行规范.md#task-item-status) 与 Task 终态事务。

<a id="cancel-result-message"></a>
#### CancelResult

> [重复摘要｜非规范性]
> 本消息返回取消命令的执行结果和辅助统计；取消优先级、终态竞争及迟到完成消息处理以 [Task 状态机](Task执行规范.md#task-status) 为准。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 是 | 派发 ID |
| `task_id` | string | 是 | Task ID |
| `command_id` | string | 是 | 对应 CancelTask.command_id |
| `canceled_at` | string | 是 | 取消完成时间 |
| `result` | string | 是 | 小写协议结果枚举，注册见 [错误标识注册表](错误标识注册表.md#error-registry) 表 C：`canceled` / `already_finished` / `not_found` / `force_killed`；不是 REST 或执行错误码 |
| `message` | string | 否 | 补充说明 |
| `statistics` | object | 否 | 取消时的统计快照 |

Master 将 `CancelResult` 作为取消命令执行事实，并交由 [Task 最终状态裁定规则](Task执行规范.md#task-terminal-arbitration) 仲裁，不由传输层无条件覆盖 Task 终态：

```text
result=canceled|force_killed -> 作为取消已完成的裁定输入；仅在当前状态与 assignment 允许时收敛为 canceled
result=already_finished      -> 保留 Master 已持久化的终态，或与并发完成消息按首个合法终态事务裁定
result=not_found             -> 触发本地状态对账并记录诊断；后续状态由 Task 状态机和终态事务裁定
Task 已为 canceled / timeout 或其他终态 -> 幂等保留，不覆盖
```

<a id="log-batch-message"></a>
#### LogBatch

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 否 | 有所属 Task 时必填 |
| `task_id` | string | 否 | 有所属 Task 时必填 |
| `items` | array<LogItem> | 是 | 1～N 条日志；建议单批不超过 200 条 |

`LogItem`：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `task_item_id` | string | 否 | 关联 TaskItem |
| `level` | string | 是 | `debug` / `info` / `warning` / `error` |
| `message` | string | 是 | 已尽量脱敏的正文 |
| `fields` | object | 否 | 结构化字段 |
| `source` | string | 是 | `script` / `worker` / `runtime` |
| `seq` | integer | 否 | Task 内序号；有则 Master 按 seq 去重/排序 |
| `created_at` | string | 是 | 日志时间，RFC3339 |

<a id="runtime-report-batch-message"></a>
#### RuntimeReportBatch

> [重复摘要｜非规范性]
> 本消息是 TaskItem、Result、Artifact 和统计的内部传输投影。`TaskItem.status` 及终态不可回滚规则以 [TaskItem 状态机](Task执行规范.md#task-item-status) 为准，统计公式以 [统计规则](Task执行规范.md#task-statistics) 为准，统计权威来源以 [Task 状态机](Task执行规范.md#task-status) 为准，资源对外契约以 [TaskItem API](Task执行规范.md#task-item-api) 和 [Result、Artifact 与 Log](结果-产物-日志.md#result-artifact-log-api) 为准。

Worker Runtime / SDK 产生的业务上报，由 Worker 汇聚后转发 Master。第一版用于 TaskItem、Result、Artifact 元数据与统计增量。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 是 | 派发 ID |
| `task_id` | string | 是 | Task ID |
| `reports` | array<RuntimeReport> | 是 | 按产生顺序排列 |

`RuntimeReport`（逻辑 oneof）：

| kind | 关键字段 | 说明 |
|---|---|---|
| `task_item_upsert` | `item_id`, `type`, `key`, `index`, `status`, `input_data?`, `output_data?`, `error_*?`, `summary?`, `idempotency_key?`, `started_at?`, `finished_at?` | 创建或更新 TaskItem |
| `result_upsert` | `result_id?`, `task_item_id?`, `type`, `key?`, `data`, `idempotency_key?` | 结构化结果 |
| `artifact_upsert` | `artifact_id?`, `task_item_id?`, `name`, `type`, `content_type`, `size`, `storage_backend`, `storage_key`, `checksum?`, `idempotency_key?` | 产物元数据；大文件内容走 Worker→Master 旁路上传，不进 gRPC 流 |
| `statistics_patch` | `total_items?`, `pending_items?`, ... 与 `Task.statistics` 同名字段的增量或全量快照 | 刷新 Task 统计 |

规则：

```text
同一 Task 内 idempotency_key 去重；与创建请求级幂等键的作用域差异由 [`ALIGN-013`](待对齐问题.md#align-013) 跟踪
TaskItem 终态不可回滚
Master 以 assignment_id fencing：旧 assignment 的 RuntimeReport 直接丢弃
Artifact 二进制不进本消息；仅传元数据与 storage_key
```

TaskItem 终态规则见 [TaskItem 状态机](Task执行规范.md#task-item-status)。

<a id="master-to-worker-messages"></a>
### Master -> Worker 消息

第一版消息：

```text
Welcome
AssignTask
CancelTask
Ping
AbortAssignment
```

<a id="welcome-message"></a>
#### Welcome

对 `Hello` 的应答。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `server_time` | string | 是 | Master 当前时间，RFC3339，便于 Worker 粗略校时 |
| `heartbeat_interval_seconds` | integer | 是 | 建议心跳间隔，默认 `5` |
| `heartbeat_timeout_seconds` | integer | 是 | Master 判定离线的超时，默认 `15` |
| `accepted` | boolean | 是 | 是否接受该 Worker 会话 |
| `reject_reason` | string | 否 | `accepted=false` 时必填；属于独立的 Worker 会话拒绝命名空间，当前未登记固定值，扩展规则见 [错误标识注册表](错误标识注册表.md#diagnostic-and-protocol-codes)。稳定注册边界由 [`ALIGN-009`](待对齐问题.md#align-009) 跟踪；决策前它不是 TaskAck 拒绝原因或执行错误码 |
| `reconcile_actions` | array<object> | 否 | 对账结果；`accepted=true` 时对 Hello.running_tasks 给出 keep / abort / retransmit 决策 |

`reconcile_actions` 项：

| 字段 | 类型 | 说明 |
|---|---|---|
| `action` | string | `abort_assignment` / `keep` / `retransmit_started` / `retransmit_cancel` |
| `task_id` | string | Task ID |
| `assignment_id` | string | 派发 ID |
| `reason` | string | 当前实现使用的对账原因示例：`TASK_TERMINAL`、`ASSIGNMENT_MISMATCH`、`WORKER_MISMATCH`、`STALE_DISPATCH`；跨实现稳定集合尚未定稿，由 [`ALIGN-009`](待对齐问题.md#align-009) 跟踪 |

Master 对 Hello.running_tasks 的对账矩阵：

| Worker 本地 ref | Master 当前事实 | 动作 |
|---|---|---|
| 无匹配 Task / assignment | Master 无该 Task，或 assignment 不匹配 | `abort_assignment` |
| 有匹配 ref | Task 已终态 | `abort_assignment`；不得复活终态 |
| 有匹配 ref | Task=`pending`，无有效 assignment | `abort_assignment` |
| 有匹配 ref | Task=`dispatching` 且 assignment 已过期/已回收 | `abort_assignment` |
| 有匹配 ref | Task=`dispatching`、assignment 仍有效且未过 start deadline | `retransmit_started` 或要求重新发送 TaskAck/TaskStarted；Hello 本身不得把 Task 改成 running |
| 有匹配 ref | Task=`running` 且 worker/assignment 完全匹配 | `keep` |
| 有匹配 ref | Task=`canceling` | 重发 `CancelTask`，不用 keep 恢复普通执行；dispatching 阶段取消路径由 [`ALIGN-005`](待对齐问题.md#align-005) 跟踪 |
| 有匹配 ref | Master 已因 offline 把 Task 写成 `failed(WORKER_OFFLINE)` | `abort_assignment`，不得 keep |

对账规则：

```text
对账完成前，Worker 不参与新的 AssignTask 匹配
keep 仅适用于 Master 仍认为该 assignment 是当前 running 执行者
abort 后 Worker 必须停止本地进程并移除本地 ref
重连不得覆盖 Master 已提交的终态
写 RECONCILIATION_ABORT 事件，metadata 中记录 task_id / assignment_id / reason
```

<a id="assign-task-message"></a>
#### AssignTask

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `assignment_id` | string | 是 | 派发 ID，fencing 主键 |
| `task_id` | string | 是 | Task ID |
| `bot_id` | string | 是 | Job Definition ID |
| `bot_code` | string | 是 | Job Definition code |
| `bot_version_id` | string | 否 | 版本 ID |
| `entrypoint` | string | 是 | 入口文件，例如 `main.py` |
| `script_source` | string | 是 | 第一版 `upload` |
| `source_file_id` | string | 否 | 脚本包 Source File ID |
| `script_download` | object | 是 | 脚本获取方式，见下表 |
| `input_source` | string | 是 | `file` / `params` / `task_items` / `none` |
| `input_file_id` | string | 否 | 输入文件 ID |
| `input_download` | object | 否 | 输入文件获取方式；`input_source=file` 时必填 |
| `input_params` | object | 否 | JSON 参数；敏感字段应已按 Job Definition 配置处理 |
| `config` | object | 否 | 运行配置 |
| `requirements` | object | 否 | 运行要求快照 |
| `timeout_seconds` | integer | 否 | Task 整体超时 |
| `cancel_grace_period_seconds` | integer | 是 | 取消宽限期，默认 `30` |
| `task_token` | string | 是 | 短期任务令牌，注入 SDK 访问本机 Runtime |
| `env` | map<string,string> | 是 | 必含 `BOT_ID`/`TASK_ID`/`TASK_TOKEN`/`BOT_RUNTIME_ADDR` 等 |
| `ack_deadline_at` | string | 是 | 须在此之前发送合法 TaskAck |
| `start_deadline_at` | string | 是 | accepted 后须在此之前发送合法 TaskStarted |
| `dispatch_deadline_at` | string | 否 | 兼容字段；若同时出现，以 `ack_deadline_at` / `start_deadline_at` 为准 |

`script_download` / `input_download`：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `method` | string | 是 | 第一版 `http_get` |
| `url` | string | 是 | Master 内部下载 URL 或签名 URL |
| `headers` | map<string,string> | 否 | 下载鉴权头；禁止写入日志 |
| `checksum` | string | 否 | 期望校验值 |
| `expires_at` | string | 否 | URL 过期时间 |

Worker 处理：

```text
1. 校验 free_slots / runtime / capabilities / 当前 assignment 未被 abort
2. 在 ack_deadline_at 前发送 TaskAck
3. 下载脚本与输入文件
4. 启动前再次确认 assignment 有效且当前时间未超过 start_deadline_at
5. 启动 Worker Runtime 与 Python 进程
6. 在 start_deadline_at 前发送 TaskStarted
7. 转发日志与 RuntimeReportBatch
8. 进程结束后发送 TaskFinished 或 TaskFailed
```

若在启动前收到 `AbortAssignment`、对账要求 abort，或已超过 `start_deadline_at`，Worker 必须停止准备并禁止启动，不得继续下载后的副作用执行路径。

<a id="cancel-task-message"></a>
#### CancelTask

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `command_id` | string | 是 | 取消命令 ID，CancelResult 原样带回 |
| `assignment_id` | string | 是 | 派发 ID |
| `task_id` | string | 是 | Task ID |
| `reason` | string | 否 | 取消原因 |
| `cancel_grace_period_seconds` | integer | 是 | 优雅退出等待秒数 |
| `force_after_grace` | boolean | 是 | 默认 `true`；宽限期后强制杀进程 |

Worker 处理：

```text
通知脚本 / Runtime 取消
等待 grace period
超时且 force_after_grace=true 则强杀
上报 CancelResult
```

上述契约只覆盖用户取消。Task 整体超时是否复用 `CancelTask`、如何确认远程进程已终止以及终止未确认时的责任边界尚未定稿，由 [`ALIGN-006`](待对齐问题.md#align-006) 跟踪。

<a id="ping-message"></a>
#### Ping

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `nonce` | string | 是 | 随机串 |
| `server_time` | string | 是 | Master 时间 |

Worker 收到后应在下一次 Heartbeat 中带上最近 `nonce`（可放 `metrics.last_ping_nonce`），或第一版仅用于 Master 侧 RTT 探测、不强制回包。

<a id="abort-assignment-message"></a>
#### AbortAssignment

Master 用于宣告 assignment 已失效，并要求 Worker 停止准备或本地执行。它**不是**用户取消，不单独决定 Task 终态。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `task_id` | string | 是 | Task ID |
| `assignment_id` | string | 是 | 已失效或即将被本地禁止的 assignment |
| `reason` | string | 是 | 当前使用的控制原因：`ACK_TIMEOUT` / `START_TIMEOUT` / `WORKER_DISABLED` / `RECONCILIATION_STALE` / `TASK_TERMINAL` / `TASK_CANCELED` / `SUPERSEDED`；稳定注册边界由 [`ALIGN-009`](待对齐问题.md#align-009) 跟踪 |
| `abort_deadline_at` | string | 是 | Worker 应立即执行 abort 的控制截止时间；可等于发送时刻 |

Worker 强制行为：

```text
若 assignment 尚未启动：删除准备态、取消下载/启动流程、禁止启动
若 Master 尚未收到合法 TaskStarted，但本地已启动：立即停止本地进程
后续不得用该 assignment 上报 Task / TaskItem / Result / Artifact / 业务日志
即使 Abort 消息暂时未送达，Worker 也必须在本地 start_deadline_at 到期后自行停止启动流程
```

Master 在发送 AbortAssignment 前应先使该 assignment 在状态机中失效，或已确认 Task 终态；Abort 投递失败不能恢复旧 assignment 的写入资格。写 `ASSIGNMENT_ABORT_REQUESTED` 事件。

<a id="worker-dispatch"></a>
## Master 调度策略与 Worker 匹配规则

> [本节角色]
> 本节是 Task 出队、Worker 候选匹配、容量预约、派发尝试、退避、长期 pending 和调度事务边界的权威来源。Task 状态迁移与终态裁定仍以 [Task 状态机](Task执行规范.md#task-status) 为准；消息 payload 以 [Worker 协议](Worker协议与运行时.md#worker-protocol) 为准。

### Pending 队列、FIFO、priority 与 aging

可调度条件：

```text
Task.status = pending
next_dispatch_at <= now
cancel_requested_at 为空
Job Definition Version / 脚本 Source File / 输入引用仍可用于执行
dispatch_attempts < max_dispatch_attempts
```

`priority` 规则：

```text
合法范围：整数 0..100
默认值：50
普通创建主体：0..50
高优先级主体 / 管理员：51..100
超出范围：422 INVALID_INPUT
无权限设置 51..100：403 FORBIDDEN
创建、retry、rerun、Schedule 生成 Task 使用同一规则
```

effective priority：

```text
waiting_time = now - queue_entered_at
effective_priority = min(100, priority + floor(waiting_time / aging_interval))
aging_interval 默认 5 minutes，作为 Master 配置，不是 Task API 字段
effective_priority 仅用于排序，不回写 tasks.priority
```

出队排序：

```text
1. effective_priority DESC
2. queue_entered_at ASC
3. task_id ASC
```

入队规则：

```text
初次创建 pending：
  queue_entered_at = created_at
  next_dispatch_at = created_at
  dispatch_attempts = 0

真正重新入队（拒绝、Ack/Start deadline、dispatching offline/disable 回收）：
  status = pending
  queue_entered_at = now
  next_dispatch_at = now + backoff
  即进入同优先级队尾，不保留旧 FIFO 位置

仅无候选 Worker：
  保持 queue_entered_at 不变，使 aging 持续累积
  仅更新 next_dispatch_at 并写 NO_CANDIDATE_WORKER
```

### requirements 缺省匹配与 Worker 稳定选择

`requirements` 在写入时若为 `null`，规范化为 `{}`。

| 字段 | 缺省 / 空集合 | 有值时 |
|---|---|---|
| `runtime` | 不限制 | Worker `runtimes` 必须包含该值 |
| `image` | 不限制 | Worker `images` 必须包含该值 |
| `capabilities` | `[]`，不限制 | Worker 必须包含全部要求 capability |
| `labels` | `{}`，不限制 | Worker 对每一键做精确值匹配 |
| 未登记字段 | 不允许 | 创建/覆盖时返回 `422 INVALID_INPUT` |

`runtime` / `image` 为空字符串视为非法输入，不得表示“不限制”。

候选 Worker 必须同时满足：

```text
worker.status == online
心跳未超时
对账已完成，可参与调度
worker 未被 disabled
requirements 匹配
Master 计算的 effective_free_slots > 0
若 Task 指定了 placement，还必须进入对应候选集合（见下）
```

### Placement：auto / Worker Pool / Worker 节点

Schedule 或手动创建 Task 时可以指定 **投放目标（placement）**。投放字段在 materialize 时冻结到 Task（或静态 mock 中的 TaskRun），调度阶段只读这些字段，不回看 Schedule 的最新配置。

| 模式 | 字段 | 候选集合 |
|---|---|---|
| Auto dispatch（自动调度） | `target_worker_id = null` 且 `target_pool_id = null` | 全部满足上表条件的 Worker |
| Worker Pool | `target_pool_id = <pool_id>` 且 `target_worker_id = null` | 该池成员 ∩ 上表条件 |
| Worker 节点 pin | `target_worker_id = <worker_id>` | 仅该节点（仍须满足上表条件） |

优先级：

```text
1. target_worker_id 非空 → 节点 pin（忽略 target_pool_id）
2. 否则 target_pool_id 非空 → 池内候选
3. 否则 auto dispatch
```

说明：

```text
Worker Pool 只缩小候选集合，不覆盖节点容量
节点 max_concurrency / effective_free_slots 仍是权威约束
池标签（tags）用于运维分组与展示；匹配仍以成员列表 + requirements 为准
V1 不支持嵌套池（pool-of-pools）
```

无候选时的行为：

```text
自动调度 / 池内无在线可用节点：保持 pending，写 NO_CANDIDATE_WORKER（或等价事件），按退避更新 next_dispatch_at
节点 pin 且目标离线 / 禁用 / 无槽位：保持 pending，不自动改派到其他节点
Schedule 触发前若目标池缺失 / 禁用 / 成员为空：ScheduleRun 记 skipped，不创建 Task
  reason ∈ { target_pool_missing, target_pool_disabled, target_pool_empty }
节点 pin 在 Schedule 触发时若 worker 记录不存在：ScheduleRun 记 skipped，reason = target_worker_missing
```

Worker 排序：

```text
effective_load = effective_used_slots / max_concurrency
1. effective_load ASC
2. stable_hash(task_id, worker_id) ASC
3. worker_id ASC
```

`stable_hash` 必须使用固定、跨进程可复现的哈希算法和明确字节串编码，禁止带随机种子的运行时 hash。同一 Task 在候选集合不变时得到稳定 Worker 顺序，同时避免单纯按 `worker_id` 形成热点。

<a id="worker-pool"></a>
## Worker Pool（工作池）

> [本节角色]
> 本节定义 Worker Pool 资源模型与管理语义。调度候选如何使用 `target_pool_id` 见 [Worker 调度](#worker-dispatch)；Schedule / Task 上的投放字段见 [Schedule 规范](Schedule调度规范.md#schedule-api) 与 [Task 规范](Task执行规范.md#task-model)。

Worker Pool 是一组显式成员 Worker 的命名投放范围，用于把同类标签 / 容量画像的节点聚成可调度单元。用户可以把 Schedule 或手动运行投放到 **池** 或 **单个节点**。

### 资源模型

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | Worker Pool ID，例如 `wpool_edge` |
| `name` | string | 是 | 展示名称 |
| `description` | string | 否 | 说明 |
| `tags` | array<string> | 是 | **池意图标签**（运维可空）：用于列表过滤、展示与成员推荐；**不**替代 Worker `system_tags` / `user_tags` / `runtimes`，**不**参与 requirements 匹配，**不**自动入池/出池 |
| `worker_ids` | array<string> | 是 | 成员 Worker ID 列表（V1 **唯一**权威成员关系；非自动按标签发现） |
| `status` | string | 是 | `enabled` / `disabled` / `archived` |
| `enabled` | boolean | 是 | 与 status 同步的便捷投影 |
| `created_by` | string | 是 | 创建人 |
| `created_at` | string | 是 | 创建时间 |
| `updated_at` | string | 是 | 更新时间 |

规则：

```text
同一 Worker 可属于多个池
禁用池：禁止新的投放以该池为 target；已冻结 target_pool_id 的 pending Task 在调度时视作无候选（保持 pending）
归档池：不得再被新的 Schedule / Task 引用
成员变更立即影响后续调度扫描；已在其他节点 dispatching/running 的 assignment 不因成员变更回滚
V1 不实现嵌套池、按标签自动入池、池级 max_concurrency

池标签（tags）语义：
  - 可选；空数组合法（临时池 / 未分类池）
  - 写入时 trim、去空、去重
  - 仅表示运维意图（如 edge / gpu / finance），与 Worker 标签可同名，但是约定而非外键
  - 控制台可按「池 tags ∩ Worker(system_tags ∪ user_tags)」软推荐 / 软提示成员
  - 改 tags 不得改写 worker_ids；调度候选仍只看 worker_ids
```

### 管理 REST（V1 草案）

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/api/worker-pools` | 创建工作池 |
| `GET` | `/api/worker-pools` | 列表 |
| `GET` | `/api/worker-pools/{pool_id}` | 详情 |
| `PATCH` | `/api/worker-pools/{pool_id}` | 更新名称 / 描述 / 标签 / 成员 |
| `POST` | `/api/worker-pools/{pool_id}/enable` | 启用 |
| `POST` | `/api/worker-pools/{pool_id}/disable` | 禁用 |

创建请求至少包含 `name`；`worker_ids` / `tags` 可为空数组。未知 `worker_id` 在写入时丢弃或返回 `422 INVALID_INPUT`（实现二选一，须一致）。

<a id="worker-capacity-reservation"></a>
### Master 容量预约与 Heartbeat 冲突裁决

Master 权威容量模型：

```text
master_active_assignments(worker) =
  count(Task where
    worker_id = worker
    and assignment_id is current
    and status in (dispatching, running, canceling))

reported_free_slots = min(
  heartbeat.free_slots,
  max_concurrency - heartbeat.current_running,
  max_concurrency - count(heartbeat.running_tasks)
)

effective_free_slots = max(
  0,
  min(reported_free_slots, max_concurrency - master_active_assignments(worker))
)

effective_used_slots = max_concurrency - effective_free_slots
```

规则：

```text
Heartbeat 不得覆盖或释放 Master 已建立的 reservation
三个 Heartbeat 容量字段冲突时取最保守结果，写 HEARTBEAT_CAPACITY_CONFLICT
pending -> dispatching 成功提交时立即占用 reservation
TaskAck accepted=true 后仍占用 reservation
合法 TaskStarted 后，dispatching reservation 转为 running 占用
拒绝、deadline、dispatching offline/disable、派发前取消导致 assignment 失效时释放 reservation
并发调度循环必须通过条件更新 / 行锁保证最后一个槽位不会被超卖
```

### 派发尝试、退避、长期无候选与人工处置

第一版默认配置：

```text
max_dispatch_attempts = 8
base_backoff = 30 seconds
max_backoff = 30 minutes
no_candidate_alert_after = 15 minutes
ack_timeout = 30 seconds
start_timeout = 120 seconds
```

计数与退避：

```text
仅成功生成 assignment_id 并提交 reservation 时：
  dispatch_attempts += 1

gRPC 发送失败：
  同一 message_id + assignment_id 重投
  不增加 dispatch_attempts
  不建立第二次 reservation

派发前回收后的退避：
  backoff = min(base_backoff * 2^(dispatch_attempts - 1), max_backoff)
  next_dispatch_at = now + backoff
  queue_entered_at = now
  reason 至少包含 TASK_ACK_REJECTED / ACK_DEADLINE_EXPIRED /
         START_DEADLINE_EXPIRED / WORKER_OFFLINE_RECLAIM /
         WORKER_DISABLED_RECLAIM + DISPATCH_REQUEUED

无候选 Worker：
  不增加 dispatch_attempts
  不重置 queue_entered_at
  按等待时长分档设置 next_dispatch_at，上限 max_backoff
  写 NO_CANDIDATE_WORKER；达到 no_candidate_alert_after 后产生去重告警
  Task 保持 pending，不写 Task.error_code，不自动 failed
```

达到上限：

```text
dispatch_attempts >= max_dispatch_attempts 时：
  status 保持 pending
  next_dispatch_at = null
  写 DISPATCH_ATTEMPTS_EXHAUSTED
  停止自动派发，等待人工处置
```

人工处置：

```text
修复 Worker / 调整 requirements / enable Worker 后，可被后续调度扫描重新发现
或调用 POST /api/tasks/{task_id}/resume-dispatch 显式恢复自动派发
resume-dispatch 重置 dispatch_attempts，并重新设置 queue_entered_at / next_dispatch_at
```

### 调度事务、命令投递与竞态矩阵

建立 assignment 的事务（同一数据库事务）：

```text
1. 按本节规则选出到期 pending Task，并再次校验可调度条件
2. 锁定 / 条件更新候选 Worker 与 Master 容量计数
3. 再次验证 online、心跳、对账完成、requirements、effective_free_slots > 0
4. 生成新的 assignment_id
5. 条件更新 Task：
     pending -> dispatching
     worker_id = selected_worker
     assignment_id = new_assignment_id
     dispatching_at = now
     assignment_acked_at = null
     ack_deadline_at = now + ack_timeout
     start_deadline_at = now + start_timeout
     dispatch_attempts += 1
6. 写 DISPATCH_RESERVED
7. 事务提交后发送 AssignTask；发送失败只重投同一 assignment / message
```

Ack / Started / 回收事务：

```text
TaskAck accepted=true：
  条件校验后写 assignment_acked_at，状态保持 dispatching

TaskAck rejected / Ack deadline / Start deadline /
dispatching offline / dispatching disable：
  条件锁定 status=dispatching + 当前 assignment_id
  失效 assignment，释放 reservation
  回 pending，更新 queue_entered_at / next_dispatch_at
  写精确 reason 与 DISPATCH_REQUEUED
  若 Worker 仍连通，发送 AbortAssignment

TaskStarted：
  条件校验后 dispatching -> running
  与回收事务只有一方可成功提交
```

统一竞态矩阵：

| 先成功提交的事实 | 并发事实 | 裁决 |
|---|---|---|
| 用户取消 | Ack/Start deadline、dispatching offline/disable | 取消优先；不得回 pending 或生成新 assignment |
| deadline 回收 | 迟到 Ack/Started | 旧消息丢弃；Worker abort |
| Worker disable | 迟到 Started | 未 Started assignment 回收；Started 被 fencing |
| 合法 Started | disable | running 不被打断、不改派 |
| 合法 Started | deadline sweep | running 优先；派发 deadline 不再适用 |
| dispatching offline | 迟到 Ack/Started | 回 pending；旧消息丢弃 |
| running offline | Worker 重连旧 assignment | Task=`failed(WORKER_OFFLINE)` 保持；重连 abort |
| 已提交终态 | 取消或其他终态消息 | 现有“首个合法终态事务”规则不变 |

优先级声明：

```text
用户取消已持久化 > 终态已持久化 > dispatching 回收条件 > TaskStarted
自动重新入队 / 改派只发生在合法 TaskStarted 之前
```

`task_events.metadata` 最小字段（按事件适用）：

```json
{
  "scheduler_cycle_id": "sched_xxx",
  "old_assignment_id": "assign_old",
  "new_assignment_id": "assign_new",
  "worker_id": "worker_xxx",
  "previous_worker_id": "worker_old",
  "dispatch_attempts": 3,
  "queue_entered_at": "2026-07-15T12:00:00Z",
  "next_dispatch_at": "2026-07-15T12:04:00Z",
  "ack_deadline_at": "2026-07-15T12:02:00Z",
  "start_deadline_at": "2026-07-15T12:05:00Z",
  "reject_reason": "NO_FREE_SLOT",
  "candidate_count": 2,
  "capacity_snapshot": {
    "reported_free_slots": 1,
    "master_active_assignments": 2,
    "effective_free_slots": 1
  }
}
```

禁止写入 token、认证头、签名下载 URL、secret 或未脱敏 config/requirements。

### 幂等字段与消息处理规则

关键字段：

```text
message_id      所有消息；接收方按 ID 去重
assignment_id   所有 Task 派发与上报；fencing 主键
command_id      CancelTask / CancelResult 配对
session_id      绑定当前 gRPC 连接；过期 session 的消息丢弃
idempotency_key RuntimeReportBatch 内 TaskItem / Result / Artifact 业务幂等
```

规则：

- `AssignTask` 必须携带 `assignment_id`、`ack_deadline_at`、`start_deadline_at`。
- `TaskAck` / `TaskStarted` / `TaskFinished` / `TaskFailed` / `CancelResult` / `RuntimeReportBatch` / 带 Task 的 `LogBatch` 必须携带 `assignment_id`。
- Master 只接受当前 `assignment_id` 的上报；旧 assignment 直接丢弃。
- Task 终态不可覆盖。
- 重复 `message_id` 不重复执行副作用，可返回当前结果。
- Worker 断线重连后，`Hello.running_tasks` 必须与 Master 对账。
- `Welcome.reconcile_actions` 对未知、旧、终态或不匹配 assignment 要求 abort。
- `AbortAssignment` 用于派发前 lease 回收，不改变用户取消语义。
- payload 字段定义分别见 [Worker -> Master 消息](#worker-to-master-messages) 与 [Master -> Worker 消息](#master-to-worker-messages)。

消息前置条件：

| 消息 | 必须条件 | 不满足时 |
|---|---|---|
| `TaskAck` | `dispatching`、当前 assignment、当前 Worker/session、未超 Ack deadline | 丢弃或幂等返回 |
| `TaskStarted` | `dispatching`、已 accepted、未超 Start deadline、当前 assignment | 丢弃，并要求 Worker abort |
| `TaskFinished` / `TaskFailed` | `running` 或合法 `canceling`、当前 assignment | 丢弃 |
| `RuntimeReportBatch` / Task LogBatch | 当前 assignment 且 Task 未终态 | 丢弃 |
| `CancelResult` | `canceling`、当前 assignment、`command_id` 匹配 | 幂等返回/丢弃 |

### Worker 离线处理

Worker 心跳超时或 stream 断开超过超时时间：

```text
Worker.status = offline
```

第一版：

```text
dispatching 且尚未合法 TaskStarted：
  原子失效 assignment，释放 reservation
  dispatching -> pending
  按 Worker 调度规则设置 queue_entered_at / next_dispatch_at
  写 WORKER_OFFLINE_RECLAIM + DISPATCH_REQUEUED
  属于派发前自动重派，可生成新 assignment

running 所属 Worker offline：
  running -> failed
  Task.error_code = WORKER_OFFLINE  # 已注册的执行错误码
  不自动改派、不自动创建新 Task、不因 retriable 自动恢复

canceling 所属 Worker offline：
  取消优先；不得改写为 failed(WORKER_OFFLINE)
  经过有界取消对账后按取消流程收敛为 canceled，并记录远端终止未确认

pending：
  不因无 Worker 或 Worker offline 自动 failed
```

Worker 重连后：

```text
若 Master 已因 offline 将 Task 写成 failed(WORKER_OFFLINE)，
重连 Hello 中的同 assignment 只能 abort，不得 keep 或复活
若 stream 短暂重建且 Master 尚未越过离线裁决阈值，
同一有效 running assignment 可 keep
```

<a id="worker-rest-api"></a>
## Worker 管理 REST API 定稿

Worker 节点通过 gRPC `Connect()` 自注册到 Master，**第一版不提供 REST 创建 Worker**。  
REST API 只负责运维查询、启停调度，以及查看负载。

### 接口索引

| 方法 | 路径 | 用途 | 详细说明 |
|---|---|---|---|
| `GET` | `/api/workers` | 分页查询 Worker 列表 | [查询 Worker 列表](#list-workers) |
| `GET` | `/api/workers/{worker_id}` | 查询 Worker 详情 | [查询 Worker 详情](#get-worker) |
| `POST` | `/api/workers/{worker_id}/enable` | 允许该 Worker 接收新 Task | [启用 / 禁用 Worker](#enable-disable-worker) |
| `POST` | `/api/workers/{worker_id}/disable` | 禁止该 Worker 接收新 Task | [启用 / 禁用 Worker](#enable-disable-worker) |
| `GET` | `/api/workers/{worker_id}/tasks` | 查询该 Worker 上的 Task | [查询 Worker 上的 Task](#list-worker-tasks) |

第一版不提供：

```http
POST   /api/workers
DELETE /api/workers/{worker_id}
PATCH  /api/workers/{worker_id}
POST   /api/workers/{worker_id}/drain
```

说明：

```text
Worker 生命周期由进程启动 + gRPC 连接建立，不由管理后台手工创建
删除 Worker 记录可在后续版本做归档清理，第一版保留历史 Worker 行
drain 语义可通过 disable + 等待 current_running 降为 0 近似实现
```

### 共享返回对象：Worker

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | Worker ID，例如 `worker-01` |
| `name` | string | 是 | 展示名称 |
| `hostname` | string | 是 | 主机名 |
| `status` | string | 是 | WorkerStatus，见下表 |
| `version` | string | 否 | Worker **进程**版本（如 `workerd/1.4.2`）；**不是** Python 解释器版本 |
| `session_id` | string | 否 | 当前 gRPC 连接会话 ID；offline 时可为空 |
| `runtimes` | array<string> | 是 | 支持的脚本 runtime，例如 `["python3.12"]`；Hello / 注册上报，**控制台只读**；用于 `requirements.runtime` 匹配；**不要**做成用户标签 |
| `images` | array<string> | 否 | 支持的镜像标签列表 |
| `capabilities` | array<string> | 是 | 能力标签，例如 `["selenium", "chromium"]`；由 Worker 注册上报，控制台只读 |
| `labels` | object | 否 | 键值标签，例如 `{"region":"cn-east"}`；由 Worker 注册上报，控制台只读 |
| `system_tags` | array<string> | 是 | **系统标签**：Worker 在 Hello / 注册时上报的扁平标签视图（通常由 capabilities / labels / region 等投影），**控制台不可修改** |
| `user_tags` | array<string> | 是 | **用户标签**：运维在管理页面维护的标签，可增删改；不得与 `system_tags` 中已有值重名 |
| `max_concurrency` | integer | 是 | 最大并发 Task 数 |
| `current_running` | integer | 是 | 最近 Heartbeat 上报的本地运行中 Task 数，是容量计算输入之一 |
| `free_slots` | integer | 是 | Master 按 [容量预约与 Heartbeat 冲突裁决](#worker-capacity-reservation) 计算的 reservation-aware `effective_free_slots` 对外投影；不得直接等同于 `max_concurrency - current_running` |
| `load_score` | number | 是 | 基于同一 reservation-aware 容量视图计算的只读负载分数，即 `effective_used_slots / max_concurrency`；`max_concurrency=0` 时为 `1.0` |
| `running_tasks` | array<object> | 否 | 当前运行 Task 摘要列表；列表接口可省略或只返回 ID |
| `metrics` | object | 否 | 可选资源指标，例如 cpu/memory；第一版可为空对象 |
| `last_heartbeat_at` | string | 否 | 最近心跳时间 |
| `connected_at` | string | 否 | 当前会话连接时间 |
| `disconnected_at` | string | 否 | 最近断开时间 |
| `disabled_at` | string | 否 | 被管理员禁用的时间；`status=disabled` 时有值 |
| `disable_reason` | string | 否 | 禁用原因 |
| `created_at` | string | 是 | 首次注册时间 |
| `updated_at` | string | 是 | 更新时间 |

WorkerStatus：

| 值 | 含义 | 是否可被调度 |
|---|---|---|
| `online` | gRPC 已连接且心跳正常，且未被禁用 | 是（还需 Master 计算的 `effective_free_slots > 0` 等匹配条件，见 [Worker 调度规则](Worker协议与运行时.md#worker-dispatch)） |
| `offline` | 心跳超时或 stream 断开 | 否 |
| `disabled` | 管理员禁止接收新 Task | 否 |

标签分类：

```text
system_tags（系统标签）
  来源：Worker Hello / 注册上报
  控制台：只读展示
  用途：硬件 / 区域 / 能力等不可由运维随意改写的画像

user_tags（用户标签）
  来源：管理页面 / PATCH 运维接口
  控制台：可编辑
  用途：业务分组、运维备注、人工归类
  约束：写入时去重、trim；若与 system_tags 冲突则丢弃冲突项（系统优先）

展示：system_tags 在前，user_tags 在后
调度匹配：requirements 仍以 capabilities / labels / runtime 为准；
  system_tags / user_tags 主要用于列表过滤、运维分组与展示
```

REST 运维写接口（V1）：

```http
PATCH /api/workers/{worker_id}/user-tags
{ "user_tags": ["finance-edge", "nightly"] }
```

不得通过 REST 修改 `system_tags` / `runtimes` / `capabilities` / `labels` / `version`（只读镜像注册态）。

Python 版本归属：

```text
runtimes（系统字段）     例如 python3.12 — 脚本解释器 / 运行时能力
version（系统字段）      例如 workerd/1.4.2 — Worker 代理进程版本
system_tags / user_tags  节点标签；不用于表达 Python 版本
```

状态来源：

```text
online / offline  由 Master 根据 gRPC 连接与心跳维护
disabled          由管理 API enable/disable 写入
```

调度匹配时必须同时满足：

```text
worker.status == online
Master 计算的 effective_free_slots > 0
对账完成、心跳有效
其余 runtime / image / capabilities / labels 条件见 [Worker 调度规则](#worker-dispatch)
```

`running_tasks` 摘要项建议字段：

```text
task_id
bot_id
bot_code
status
assignment_id
started_at
```

`load_score` 是只读计算字段，不入库。`workers.current_running`、`workers.free_slots` 和 `workers.running_tasks` 记录最近 Heartbeat 的持久化投影；REST 返回的 `free_slots` 与 `load_score` 必须在读取时结合当前 Master reservation 按 [容量预约与 Heartbeat 冲突裁决](#worker-capacity-reservation) 重新计算，不得直接透传持久化的 Heartbeat `free_slots`。

<a id="list-workers"></a>
### 查询 Worker 列表

```http
GET /api/workers
```

Query 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | string | 单状态过滤：`online` / `offline` / `disabled` |
| `statuses` | string | 多状态过滤，逗号分隔 |
| `capability` | string | 要求具备某个 capability |
| `runtime` | string | 要求支持某个 runtime |
| `label` | string | 标签过滤，格式 `key:value`，可重复 |
| `q` | string | 搜索 id、name、hostname |
| `sort` | string | 默认 `-last_heartbeat_at`；也可用 `load_score`、`-current_running` |

列表项至少返回：

```text
id, name, hostname, status, version,
runtimes, capabilities, labels,
max_concurrency, current_running, free_slots, load_score,
last_heartbeat_at, connected_at, disabled_at, updated_at
```

列表默认不返回：

```text
running_tasks 全量明细
metrics 大对象
```

响应示例：

```json
{
  "data": [
    {
      "id": "worker-01",
      "name": "cn-east-worker-01",
      "hostname": "host-a",
      "status": "online",
      "runtimes": ["python3.12"],
      "capabilities": ["selenium", "chromium"],
      "labels": {"region": "cn-east"},
      "max_concurrency": 4,
      "current_running": 1,
      "free_slots": 3,
      "load_score": 0.25,
      "last_heartbeat_at": "2026-07-15T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 1
  },
  "request_id": "req_xxx"
}
```

权限：第一版建议仅管理员或运维角色可访问 Worker 列表/详情/启停。

<a id="get-worker"></a>
### 查询 Worker 详情

```http
GET /api/workers/{worker_id}
```

响应返回完整 `Worker` 共享对象，并附带操作能力：

```text
can_enable
can_disable
```

规则：

```text
can_enable  = status == disabled
can_disable = status == online 或 status == offline
             （disabled 时 disable 幂等返回当前状态）
```

详情应包含当前 `running_tasks` 摘要，便于运维判断能否安全 disable。

<a id="enable-disable-worker"></a>
### 启用 / 禁用 Worker

```http
POST /api/workers/{worker_id}/enable
POST /api/workers/{worker_id}/disable
```

禁用请求字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `reason` | string | 否 | `admin_disabled` | 禁用原因 |

启用请求体默认为空。

禁用语义：

```text
status = disabled
disabled_at = now
记录 disable_reason
Worker 不再匹配新的 AssignTask
不主动断开 gRPC；连接可保留以便上报日志与完成结果

按 Task 状态处理：
pending：
  该 Worker 不再是候选
dispatching 且尚未合法 TaskStarted：
  立即原子失效该 Worker 上的 assignment
  释放 reservation
  Task 回 pending，并按 [Worker 协议](Worker协议与运行时.md#worker-protocol) 设置退避与重新入队
  发送 AbortAssignment
  写 WORKER_DISABLED_RECLAIM + DISPATCH_REQUEUED
running / canceling：
  不打断、不取消、不改派
  允许继续上报日志、RuntimeReport 和终态消息
```

“立即回收”指 Master 对 assignment 与 reservation 的逻辑回收；Worker 仍必须收到 abort 并禁止旧 assignment 启动。不得把 disabled Worker 上的 `dispatching` Task 继续留在等待 Ack/Started 的状态。

启用语义：

```text
清除 disabled_at / disable_reason
若当前 gRPC 连接与心跳正常：status = online
若当前未连接或心跳已超时：status = offline
恢复后，在对账完成且心跳有效后重新参与调度匹配
```

响应：

```json
{
  "data": {
    "id": "worker-01",
    "status": "disabled",
    "disabled_at": "2026-07-15T12:05:00Z",
    "disable_reason": "maintenance",
    "current_running": 1,
    "updated_at": "2026-07-15T12:05:00Z"
  },
  "request_id": "req_xxx"
}
```

幂等：

```text
对已 disabled 的 Worker 再次 disable -> 200，返回当前状态
对已非 disabled 的 Worker 再次 enable -> 200，返回当前状态
```

<a id="list-worker-tasks"></a>
### 查询 Worker 上的 Task

```http
GET /api/workers/{worker_id}/tasks
```

这是 `GET /api/tasks?worker_id={worker_id}` 的便捷入口，返回结构与 Task 列表一致。

额外 Query：

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` / `statuses` | string | 同 Task 列表过滤 |
| `active_only` | boolean | 为 `true` 时只返回尚未进入 [Task 终态集合](Task执行规范.md#task-terminal-statuses) 的 Task；默认 `false` |

运维常用：

```text
GET /api/workers/{worker_id}/tasks?active_only=true
```

用于 disable 前确认是否还有活跃 Task。

### 与 gRPC 控制面的关系

- 注册、心跳、任务派发、取消和运行时上报使用 gRPC，消息字段分别见 [Worker -> Master 消息](#worker-to-master-messages) 与 [Master -> Worker 消息](#master-to-worker-messages)。
- 列表、详情、启停、负载与任务查询使用 [Worker 管理 REST](#worker-rest-api)。

Worker 认证：

```text
gRPC 连接使用 worker_token 或 shared_secret
REST 管理 API 使用用户 Bearer Token / Session，并校验管理员权限
脚本侧 TASK_TOKEN 不能访问 /api/workers
```

---

<a id="runtime-sdk"></a>
## Worker Runtime API / Python SDK 定稿

> [本节角色]
> 本节是 Python Script、`bot_sdk` 与本机 Worker Runtime 的调用契约。它把 [TaskItem 状态机](Task执行规范.md#task-item-status)～[统计规则](Task执行规范.md#task-statistics) 的状态和统计规则映射为本地 API / SDK 行为，并通过 [Worker 协议](Worker协议与运行时.md#worker-protocol) 上报，不重新定义 Master 的终态裁定。

Worker Runtime 是 Python 脚本和平台之间的本地代理。

链路：

```text
Python Script -> bot_sdk -> Worker Runtime -> Worker -> Master
```

第一版：

```text
SDK -> Worker Runtime：本地 HTTP
Worker Runtime 只监听 127.0.0.1
SDK 使用 TASK_TOKEN 鉴权
```

环境变量：

```text
BOT_ID
BOT_CODE
TASK_ID
WORKER_ID
TASK_TOKEN
BOT_RUNTIME_ADDR
INPUT_FILE_PATH
INPUT_PARAMS_JSON
TASK_CONFIG_JSON
```

<a id="runtime-http-api"></a>
### Runtime 本机 HTTP 接口

核心接口：

```http
GET  /runtime/context
GET  /runtime/cancellation

POST /runtime/task-items
POST /runtime/task-items/{item_id}/start
POST /runtime/task-items/{item_id}/success
POST /runtime/task-items/{item_id}/failed
POST /runtime/task-items/{item_id}/skipped
POST /runtime/task-items/{item_id}/timeout

POST /runtime/logs
POST /runtime/logs/batch

POST /runtime/results

POST /runtime/artifacts
POST /runtime/artifacts/file
```

<a id="python-sdk"></a>
### Python SDK

SDK 模块：

```text
context
input
task
task_item
logger
result
artifact
```

预留：

```text
notify
secrets
```

`task_item.run(...)` 行为：

> [重复摘要｜非规范性]
> 下列内容是 [TaskItem 状态机](Task执行规范.md#task-item-status) `TaskItem.status` 状态机在 SDK 上下文管理器中的行为映射；若状态名称或迁移理解存在差异，以 [TaskItem 状态机](Task执行规范.md#task-item-status) 为准。

```text
进入上下文时创建 TaskItem，状态 running
调用 item.success() -> success
调用 item.failed() -> failed
调用 item.skipped() -> skipped
上下文中抛异常 -> SDK 自动 failed，然后继续抛出异常
上下文退出时未设置终态且无异常 -> SDK 自动 failed，error_code = ITEM_NOT_FINALIZED
```

`ITEM_NOT_FINALIZED` 是 TaskItem 级执行错误码，注册见 [错误标识注册表](错误标识注册表.md#error-registry) 表 B；它不等同于 Master 在 Task 终态裁定时使用的 `ITEMS_NOT_FINALIZED`，也不会自动传播为 Task 级错误码。

---

<a id="persistence-map"></a>
## 持久化映射说明

> [持久化投影]
> 本节仅记录 `workers` 对 Worker 管理资源与控制面会话的持久化投影，不反向定义 gRPC 消息、调度裁决或 REST 行为。

### workers（持久化投影）

字段：

```text
id
name
hostname
status
version
session_id
runtimes
images
capabilities
labels
max_concurrency
current_running
free_slots
running_tasks
metrics
last_heartbeat_at
connected_at
disconnected_at
created_at
updated_at
disabled_at
disable_reason
```

status：

```text
online
offline
disabled
```

索引：

```text
index(status)
index(last_heartbeat_at)
index(name)
index(hostname)
```

说明：

- 对外管理 API 见 [Worker 管理 REST](#worker-rest-api)。
- `current_running`、`free_slots`、`running_tasks` 是最近 Heartbeat 的持久化投影；其中持久化的 `free_slots` 不是 REST 容量权威。
- REST `free_slots` 与 `load_score` 按 [容量预约与 Heartbeat 冲突裁决](#worker-capacity-reservation) 基于最新 Heartbeat 和 Master reservation 计算；`load_score` 不入库。
- Worker 通过 gRPC `Connect()` 自注册，不由 REST 创建。

