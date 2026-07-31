# JobOps V1：Tasks

> [本文件角色]
> 本文件是 Task、TaskItem、Task.status、TaskItem.status、终态裁定、统计和 Task/TaskItem REST 契约的唯一规范来源。Worker 消息只传输本文件定义的语义，Schedule 只引用本文件的 active Task 状态。
> 本文件中的完整定义是对应主题的唯一规范来源；其他文档只保留摘要、传输映射或存储映射，并通过链接回到本文件。

## 快速导航

[Task 模型](#task-model) · [Task 状态机](#task-status) · [TaskItem 状态机](#task-item-status) · [Task API](#task-api) · [持久化映射](#persistence-map)

<a id="task-model"></a>
## Task 模型

### Task

`Task` 是基于某个 `Job Definition Version` 创建的一次执行实例，表示平台现在或曾经执行过的一次完整脚本运行。Task 不是 Job Definition 定义本身，也不是可复用的脚本版本。

第一版中：

```text
Task = Job Definition Version + 本次输入 + 本次运行配置 + 执行状态 + 运行结果
```

Task 是第一版调度单元。Master 不拆分 Python 脚本内部逻辑，而是将整个 Task 分配给一个 Worker 执行。

Job Definition、Job Definition Version、Task 和 TaskItem 的关系：

| 对象 | 关系字段 | 作用 |
|---|---|---|
| `Job Definition` | `id`、`current_version_id` | 自动化能力的逻辑定义；可以产生多个 Task |
| `Job Definition Version` | `id`、`bot_id`、`status` | Task 实际使用的脚本、入口文件和配置版本 |
| `Task` | `bot_id`、`bot_version_id`、`bot_snapshot` | 一次完整执行；创建时冻结实际使用的 Job Definition Version |
| `TaskItem` | `task_id` | Task 执行过程中产生的明细和统计单元 |

Task 创建时的版本解析：

```text
指定 bot_version_id
  -> 校验该版本属于 bot_id
  -> 校验 Job Definition Version.status=published
  -> 使用指定版本

未指定 bot_version_id
  -> 读取 Job Definition.current_version_id
  -> 使用当前 published 版本

创建成功
  -> 写入 Task.bot_id、Task.bot_code、Task.bot_version_id
  -> 在 Task.bot_snapshot 中保留 bot_id、bot_code、bot_version_id、version 及 Job Definition Version 相关字段
```

Task 创建后，Job Definition 发布新版本、修改默认配置或切换 `current_version_id`，都不会改写已经创建的 Task。重试和重新执行也会创建新的 Task，并通过 `source_task_id` 记录来源。

---

### TaskItem

`TaskItem` 表示某个 Task 在脚本运行过程中动态上报的一条执行明细。一个 Task 可以包含零条、一条或多条 TaskItem；TaskItem 不独立选择 Worker，也不是第一版调度单元。

示例：

```text
Excel 中的一行审批记录
一个 URL
一个分页
一个查询条件
一个文件
一个处理步骤
```

TaskItem 是观测单元和统计单元。Task 的最终状态会结合 TaskItem 统计裁定，但 TaskItem 的终态不能直接覆盖 Master 已确定的 Task.status。

---

<a id="task-status"></a>
## TaskStatus 状态机

> [本节角色]
> 本节是 `Task.status`、Task 终态裁定、统计冲突、迟到消息和派发超时语义的权威来源。本节所有未加资源前缀的 `status` 均指 `Task.status`；REST、gRPC、数据表和 MVP 中的 Task 状态描述不得建立第二套规则。

TaskStatus 第一版定稿为：

```text
pending
dispatching
running
canceling
success
partial_success
failed
canceled
timeout
```

说明：

| 状态 | 含义 |
|---|---|
| `pending` | 已创建，等待调度 |
| `dispatching` | 正在派发给 Worker，等待 Worker ack |
| `running` | Worker 正在执行 Python 脚本 |
| `canceling` | 用户已请求取消，Worker 正在停止脚本 |
| `success` | 脚本正常完成且业务成功 |
| `partial_success` | 脚本正常完成，但部分 TaskItem 业务失败 |
| `failed` | 脚本异常退出、Worker 执行失败或业务全部失败 |
| `canceled` | 已取消 |
| `timeout` | 整体 Task 超时 |

### 状态变化

创建：

```text
pending
```

调度：

```text
pending -> dispatching -> running
dispatching -> pending  # TaskAck 拒绝、Ack/Start deadline、dispatching Worker offline/disable；旧 assignment 失效后重新排队
```

自动重新入队和自动改派只允许发生在 Master 尚未接收合法 `TaskStarted` 的派发前阶段。Task 一旦进入 `running`，平台不得因为 `TaskFailed.retriable`、Worker 负载变化、Worker disable/offline 或出现更优候选 Worker 而自动改派；执行后补救仍通过 [重试 Task](#retry-task) 或 [重新执行 Task](#rerun-task) 创建新 Task。

正常完成：

```text
running -> success
running -> partial_success
running -> failed
```

取消：

```text
pending -> canceled
dispatching -> canceling -> canceled
running -> canceling -> canceled
```

`dispatching` Task 在取消意图落库后是直接进入 `canceled`，还是统一经过 `canceling`，仍是未决的跨层冲突，见 [`ALIGN-005`：派发中取消的状态路径](待对齐问题.md#align-005)。在该 issue 关闭前，本文件不新增另一套中间态契约。

超时：

```text
running -> timeout
```

重试：

```text
原 Task 不变
创建新 Task
新 Task.status = pending
新 Task.source_task_id = 原 Task ID
```

### partial_success 语义

`partial_success` 只表示：

```text
脚本正常完成后的业务部分失败
```

不用于：

```text
脚本异常退出
用户取消
整体超时
Worker 离线
```

最终状态判断优先级：

```text
用户取消 > 整体超时 > Worker/脚本异常 > TaskItem 统计
```

<a id="task-terminal-arbitration"></a>
### Task 最终状态裁定规则

Master 是 Task 最终状态的唯一裁定者。Worker 上报的 `suggested_status` 只作为建议，不能直接覆盖 Master 已有状态或跳过下面的优先级规则。

裁定输入：

```text
Task 当前状态与 cancel_requested_at
Task 整体 deadline / timeout 判定
Worker 上报类型（TaskFinished / TaskFailed / CancelResult）
脚本 exit_code
数据库中当前 assignment_id 对应的 TaskItem 汇总统计
```

裁定顺序如下。

#### 用户取消优先

```text
如果 Task 已进入 canceling，且收到当前 assignment_id 的 CancelResult：
  result=canceled 或 force_killed -> canceled

如果 Task 已经 canceled：
  后续迟到的 TaskFinished / TaskFailed 不得覆盖 canceled
```

如果取消请求与正常完成同时发生，以 Master 首先持久化的终态为准：

```text
TaskFinished 事务先成功提交 -> 保留 success / partial_success / failed，后续取消返回 already_finished
canceling / canceled 事务先成功提交 -> 最终 canceled，后续 TaskFinished 作为迟到消息丢弃
```

#### 整体超时优先于执行结果

```text
如果 Master 已判定整体 Task 超时并持久化 status=timeout：
  后续 TaskFinished / TaskFailed / CancelResult 不得覆盖 timeout
```

整体超时只针对已进入 `running` 的 Task；`pending` / `dispatching` 排队与派发超时按调度规则处理，不使用 TaskStatus=`timeout`。

> [待对齐｜不在本次范围]
> Task 进入整体 `timeout` 后，远程进程终止、宽限期、强杀责任和终止未确认的处理尚未形成闭环，统一由 [`ALIGN-006`](待对齐问题.md#align-006) 跟踪；本节只规定终态裁定与迟到消息不得覆盖 `timeout`。

#### Worker / 脚本异常固定为 failed

满足任一条件时，最终状态为 `failed`，不再根据 TaskItem 统计降级为 `partial_success`：

```text
收到当前 assignment_id 的 TaskFailed
脚本 exit_code != 0
Worker 离线导致运行中 Task 失败
脚本启动失败、运行时崩溃、输入下载失败
协议错误导致无法确认脚本正常完成
```

收到 `TaskFinished` 且 `exit_code != 0` 时，如果 Worker 未上报更具体的已注册执行错误码，Master 写入 `Task.error_code=SCRIPT_EXIT_NONZERO`；执行错误码注册和未知值兼容规则见 [错误标识注册表](错误标识注册表.md#error-registry) 表 B。

即使部分 TaskItem 已经成功，也仍为：

```text
Task.status = failed
```

已成功的 TaskItem 保持原终态，用于结果追溯和后续失败项重试。

#### 脚本正常完成时按 TaskItem 统计裁定

只有同时满足以下条件，才进入 TaskItem 统计裁定：

```text
收到当前 assignment_id 的 TaskFinished
exit_code = 0
Task 未 canceled / timeout
不存在 Worker / 脚本级异常
```

定义：

```text
error_items = failed_items + timeout_items
non_error_completed_items = success_items + skipped_items
active_items = pending_items + running_items
```

裁定表：

| 条件 | 最终状态 | 说明 |
|---|---|---|
| `total_items = 0` | `success` | TaskItem 是可选观测单元；无 TaskItem 不代表业务失败 |
| `active_items > 0` | `failed` | 脚本已正常退出但仍有未终态 Item，写入 `Task.error_code=ITEMS_NOT_FINALIZED`；注册与外露边界见 [错误标识注册表](错误标识注册表.md#error-registry) 表 B |
| `canceled_items > 0` 且 Task 未走取消流程 | `failed` | 状态不一致，写入 `Task.error_code=UNEXPECTED_CANCELED_ITEMS`；注册与外露边界见 [错误标识注册表](错误标识注册表.md#error-registry) 表 B |
| `error_items = 0` | `success` | 包括全部 success、success+skipped，以及全部 skipped |
| `error_items > 0` 且 `non_error_completed_items > 0` | `partial_success` | 部分成功或跳过，部分失败/超时 |
| `error_items > 0` 且 `non_error_completed_items = 0` | `failed` | 所有业务 Item 均失败或超时 |

因此第一版明确：

```text
脚本 exit 0 且 total_items=0                       -> success
脚本 exit 0 且全部 TaskItem=skipped               -> success
脚本 exit 0 且 success/skipped 与 failed/timeout 混合 -> partial_success
脚本 exit 0 且全部 failed/timeout                  -> failed
脚本 exit 非 0，无论 Item 统计                     -> failed
```

`skipped` 表示脚本主动确认该项无需处理，不计入业务错误。全部 skipped 的 Task 可在 `summary` 中增加：

```json
{
  "all_items_skipped": true
}
```

便于前端区别“实际处理成功”和“全部无需处理”。

<a id="task-statistics-conflict"></a>
### 统计来源与冲突处理

Task 最终状态裁定时，以 Master 数据库中的 TaskItem 状态聚合结果为权威来源：

```text
权威来源：Master 数据库中当前 Task 的 TaskItem 聚合
辅助来源：TaskFinished.statistics / CancelResult.statistics
```

处理步骤：

1. 校验 `message_id`、`session_id`、`assignment_id`。
2. 先提交该 assignment 已接收但尚未落库的 `RuntimeReportBatch`。
3. 在同一终态事务中重新聚合 `task_items`。
4. 根据 [Task 最终状态裁定规则](#task-terminal-arbitration) 裁定 Task 最终状态。
5. 更新 `tasks` 统计冗余字段与终态。

聚合结果必须满足：

```text
total_items = pending_items + running_items + success_items + failed_items
              + skipped_items + canceled_items + timeout_items
completed_items = success_items + failed_items + skipped_items
                  + canceled_items + timeout_items
```

若 Worker 上报统计与数据库聚合不一致：

```text
不直接使用 Worker 统计覆盖数据库
以数据库聚合结果完成终态裁定
写 warning 日志，结构化字段 diagnostic_code=STATISTICS_MISMATCH（已注册的内部诊断码）
不设置 Task.error_code，也不因此把 success 改为 failed
将 Worker 统计保存在内部诊断日志或 task_event metadata 中
```

`STATISTICS_MISMATCH` 的注册与外露边界见 [错误标识注册表](错误标识注册表.md#diagnostic-and-protocol-codes)。

Task 没有创建任何 TaskItem 时，数据库聚合结果固定为全零，按 `total_items=0 -> success` 规则处理。

### 迟到、重复与终态消息规则

所有与 Task 相关的消息在改变状态或写入业务数据前，必须在同一条件更新或锁定事务中校验：

```text
task_id 正确
worker_id 是当前执行 Worker
session_id 是该 Worker 的当前会话
assignment_id 是 Task 当前有效 assignment
Task 当前状态允许处理该消息
Ack / Start deadline（如适用）尚未到期
```

规则：

```text
同一 message_id 的重复消息：幂等返回当前 Task 状态
旧 assignment_id 的消息：直接丢弃，不更新 Task / TaskItem / Log / Result / Artifact
旧 assignment_id 的旁路 Artifact 上传授权和 TASK_TOKEN 同时失效
Task 已进入任一终态：后续 TaskFinished / TaskFailed / CancelResult 不覆盖终态
TaskFinished 与 TaskFailed 竞争：同一 assignment 下首个成功提交的合法终态事务生效
```

Worker 也必须执行 assignment lease：收到 `AbortAssignment`、重连对账未获得继续许可，或本地时间已超过 `start_deadline_at` 时，不得启动该 assignment；若本地已在 Master 未确认 Started 的情况下启动，必须立即停止。Master fencing 保证平台数据不串写，但不单独承诺脚本外部副作用 exactly-once，Worker 必须通过 lease 与 abort 缩小派发前双执行窗口。

<a id="task-terminal-statuses"></a>
### Task 终态集合

```text
success
partial_success
failed
canceled
timeout
```

### Ack 与启动两阶段 deadline

`ack_deadline_at` 和 `start_deadline_at` 是派发阶段截止时间，不是 Task 整体业务超时。旧字段 `dispatch_deadline_at` 仅作为兼容的汇总名称；新实现和新协议必须使用两个独立字段。

| 阶段 | 到期条件 | Master 处理 |
|---|---|---|
| Ack 阶段 | `status=dispatching`、`assignment_acked_at=null`，且到达 `ack_deadline_at` | 使 assignment 失效、释放 reservation、重新入队 |
| Start 阶段 | 已收到 `accepted=true`，但尚未收到合法 `TaskStarted`，且到达 `start_deadline_at` | 使 assignment 失效、释放 reservation、重新入队 |
| Running 阶段 | 合法 `TaskStarted` 已提交 | 两个派发 deadline 不再适用；整体 timeout 仍按 [Task 状态机](Task执行规范.md#task-status) 处理 |

回收事务必须：

```text
1. 以 Task.status=dispatching + 当前 assignment_id 为条件锁定或条件更新
2. 再次确认 Ack / Start 到期条件仍成立
3. 使当前 assignment_id 失效并释放 dispatch reservation
4. Task.status: dispatching -> pending
5. 清空 worker_id / assignment_id / dispatching_at / assignment_acked_at / ack_deadline_at / start_deadline_at
6. 按 Worker 调度规则更新 queue_entered_at / next_dispatch_at，保留 dispatch_attempts
7. 写 ACK_DEADLINE_EXPIRED 或 START_DEADLINE_EXPIRED，并写 DISPATCH_REQUEUED
8. 下一次派发生成新的 assignment_id
9. 迟到的旧 TaskAck / TaskStarted / TaskFinished 全部因 fencing 被丢弃，并要求 Worker abort
```

其中重新入队、退避和派发尝试的规则见 [Worker 调度规则](Worker协议与运行时.md#worker-dispatch)。

如果用户取消已经先持久化，deadline sweep 不得把 `canceling` Task 回到 `pending`。`dispatching -> pending` 不属于终态，也不设置 `Task.status=timeout`；派发次数、退避和长期无 Worker 规则见 [Worker 协议](Worker协议与运行时.md#worker-protocol)。

---

<a id="task-item-status"></a>
## TaskItemStatus 状态机

> [本节角色]
> 本节是 `TaskItem.status` 枚举、迁移和终态不可回滚规则的权威来源。本节所有未加资源前缀的 `status` 均指 `TaskItem.status`；[Worker 协议](Worker协议与运行时.md#worker-protocol) 和 [Runtime / SDK](Worker协议与运行时.md#runtime-sdk) 只负责协议与 SDK 行为映射。

TaskItemStatus 第一版定稿为：

```text
pending
running
success
failed
skipped
canceled
timeout
```

说明：

| 状态 | 含义 |
|---|---|
| `pending` | 已创建但尚未开始处理 |
| `running` | 正在处理 |
| `success` | 处理成功 |
| `failed` | 处理失败 |
| `skipped` | 被脚本主动跳过 |
| `canceled` | 因 Task 取消而取消 |
| `timeout` | 单项处理超时 |

允许状态变化：

```text
pending -> running -> success
pending -> running -> failed
pending -> running -> skipped
pending -> skipped
running -> success
running -> failed
running -> skipped
running -> timeout
pending -> canceled
running -> canceled
```

不允许终态回滚：

```text
success -> failed
failed -> success
canceled -> success
timeout -> success
```

第一版原则：

```text
TaskItem 成功必须显式调用 success
TaskItem 终态不可修改
TaskItem 不支持单独取消
TaskItem 不支持原地重试
失败项重试通过 Task retry 创建新 Task
```

---

<a id="task-statistics"></a>
## 统计字段与百分比

> [本节角色]
> 本节是 TaskItem 聚合字段和百分比公式的权威来源；统计数据的权威来源、校准顺序和冲突处理以 [Task 状态机](Task执行规范.md#task-status) 为准。REST、gRPC 与数据表中的同名字段仅是读模型、传输或持久化投影。

Task 冗余保存 TaskItem 统计字段：

```text
total_items
pending_items
running_items
success_items
failed_items
skipped_items
canceled_items
timeout_items
completed_items
```

计算规则：

```text
completed_items =
  success_items
  + failed_items
  + skipped_items
  + canceled_items
  + timeout_items
```

百分比：

```text
progress_rate = completed_items / total_items
success_rate  = success_items / total_items
failed_rate   = failed_items / total_items
timeout_rate  = timeout_items / total_items
error_rate    = (failed_items + timeout_items) / total_items
```

规则：

```text
skipped 计入 completed_items，但不计入失败
 timeout 单独统计，不合并进 failed
 total_items 支持动态增长
```

动态增长示例：

```text
80 / 100 = 80%
运行中发现新任务后：80 / 200 = 40%
```

这是正常现象。

---

<a id="task-api"></a>
## Task API 定稿

> [重复摘要｜非规范性]
> 本节保留 Task 含义作为 API 上下文，不重新定义领域模型或状态机。Task 核心含义见 [Task 模型](Task执行规范.md#task-model)，`Task.status` 与终态裁定见 [Task 状态机](Task执行规范.md#task-status)，统计公式见 [统计规则](Task执行规范.md#task-statistics)；本节负责 Task 的 REST 读写契约。

Task API 面向前端、管理后台和外部调用方。Task 是基于一个已解析 `Job Definition Version` 创建的一次 Python 脚本执行，也是第一版调度单元；创建请求可省略 `bot_version_id`，但成功创建的 Task 必须记录最终解析出的 `bot_version_id`。

### 接口索引

本节只列出接口路径和用途。每个接口的请求字段、查询参数、响应内容和业务规则在后续独立小节中说明；下面的 `Task` 字段表是多个查询接口共用的返回对象定义，不属于某一个单独接口。

| 方法 | 路径 | 用途 | 详细说明 |
|---|---|---|---|
| `POST` | `/api/tasks` | 创建一次 Task 执行 | [创建 Task](#create-task) |
| `GET` | `/api/tasks` | 分页查询 Task 列表 | [查询 Task 列表](#list-tasks) |
| `GET` | `/api/tasks/{task_id}` | 查询 Task 详情 | [查询 Task 详情](#get-task) |
| `POST` | `/api/tasks/{task_id}/cancel` | 请求取消 Task | [取消 Task](#cancel-task) |
| `POST` | `/api/tasks/{task_id}/retry` | 从历史 Task 创建新的重试 Task | [重试 Task](#retry-task) |
| `POST` | `/api/tasks/{task_id}/rerun` | 从历史 Task 创建新的重新执行 Task | [重新执行 Task](#rerun-task) |
| `POST` | `/api/tasks/{task_id}/resume-dispatch` | 恢复 pending Task 的自动派发 | [恢复自动派发](#resume-task-dispatch) |
| `GET` | `/api/tasks/{task_id}/items` | 查询 TaskItem 列表 | [查询 TaskItem 列表](#list-task-items) |
| `GET` | `/api/tasks/{task_id}/logs` | 查询 Task 日志 | [Log API](结果-产物-日志.md#log-api) |
| `GET` | `/api/tasks/{task_id}/results` | 查询 Task 级 Result | [Result API](结果-产物-日志.md#result-api) |
| `GET` | `/api/tasks/{task_id}/artifacts` | 查询 Task 级 Artifact | [Artifact API](结果-产物-日志.md#artifact-api) |

### Task 接口返回数量

| 接口 | 返回数量 | 返回结构 |
|---|---|---|
| `GET /api/tasks` | 多个 | 分页对象，`data` 是 `TaskListItem[]` |
| `GET /api/tasks/{task_id}` | 一个 | 单个 `TaskDetail` 对象，放在 `data` 中 |
| `POST /api/tasks` | 一个 | 新创建的 Task 摘要，放在 `data` 中 |
| `POST /api/tasks/{task_id}/cancel` | 一个 | 被操作 Task 的状态摘要，放在 `data` 中 |
| `POST /api/tasks/{task_id}/retry` | 一个 | 新创建的重试 Task 摘要，放在 `data` 中 |
| `POST /api/tasks/{task_id}/rerun` | 一个 | 新创建的重新执行 Task 摘要，放在 `data` 中 |
| `POST /api/tasks/{task_id}/resume-dispatch` | 一个 | 被恢复自动派发的 pending Task 摘要，放在 `data` 中 |

`GET /api/tasks` 的响应结构固定为：

```json
{
  "data": [
    {
      "id": "task_001",
      "status": "success",
      "statistics": {}
    },
    {
      "id": "task_002",
      "status": "running",
      "statistics": {}
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 2
  },
  "request_id": "req_xxx"
}
```

`GET /api/tasks/{task_id}` 的响应结构固定为：

```json
{
  "data": {
    "id": "task_001",
    "status": "success",
    "statistics": {}
  },
  "request_id": "req_xxx"
}
```

### 共享返回对象：Task

`GET /api/tasks` 和 `GET /api/tasks/{task_id}` 返回的是同一个 Task 资源模型，但不是完全相同的响应投影：

```text
GET /api/tasks                  -> TaskListItem，列表摘要
GET /api/tasks/{task_id}        -> TaskDetail，完整详情
```

两者共享相同的字段命名和基础语义，但列表接口只返回适合分页展示的字段，详情接口返回完整 Task 基础字段、完整 `statistics`、Job Definition 快照、输入摘要、运行配置、错误详情和操作能力。这样既保持 API 模型一致，又避免列表接口返回过大的 JSON。

下面的字段表定义完整的 Task 资源模型。具体接口返回哪些字段，分别见 [查询 Task 列表](#list-tasks) 和 [查询 Task 详情](#get-task)；创建、取消、重试接口只返回其中的部分字段。

#### Task 返回结构

统计字段位于 Task 返回对象的 `statistics` 子对象中，不与 Task 的基础字段处于同一层级：

```json
{
  "data": {
    "id": "task_xxx",
    "bot_id": "bot_oem_approval",
    "status": "partial_success",
    "run_type": "manual",
    "created_at": "2026-07-14T10:30:00Z",
    "statistics": {
      "total_items": 100,
      "completed_items": 100,
      "success_items": 80,
      "failed_items": 15,
      "timeout_items": 2,
      "progress_rate": 1.0,
      "success_rate": 0.8,
      "error_rate": 0.17
    }
  }
}
```

数据库中可以将统计计数保存为 `tasks` 表的平铺列，以便事务更新和查询；对外 REST API 统一组合为 `Task.statistics`。

#### Task 基础字段

以下字段属于 Task 对象本身，统计字段不在此处重复列出。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | Task ID，对外唯一 |
| `bot_id` | string | 是 | 所属 Job Definition ID |
| `bot_code` | string | 是 | Job Definition 稳定编码，冗余保存用于列表展示和历史追溯 |
| `bot_version_id` | string | 是 | 本次执行实际使用的 Job Definition Version ID；请求未提供时，在创建事务中解析 `Job Definition.current_version_id` 后写入 |
| `bot_snapshot` | object | 是 | Task 创建时复制的 Job Definition / Job Definition Version 关键字段；保留 `bot_id`、`bot_code`、`bot_version_id`、`version` 等执行溯源信息，保证历史 Task 不受 Job Definition 后续修改影响 |
| `source_task_id` | string | 否 | 来源 Task ID；重试、重新执行时填写 |
| `schedule_id` | string | 否 | 来源 Schedule ID；手动/API 创建为空 |
| `schedule_run_id` | string | 否 | 来源 ScheduleRun ID |
| `target_pool_id` | string | 否 | 投放工作池；与 `target_worker_id` 互斥，节点 pin 优先；创建时冻结 |
| `target_worker_id` | string | 否 | 投放指定 Worker 节点；非空时忽略 `target_pool_id`；创建时冻结 |
| `worker_id` | string | 否 | 当前或最后执行该 Task 的 Worker ID（实际派发结果，不是投放意图） |
| `assignment_id` | string | 否 | 本次派发 ID，用于 Worker 上报 fencing |
| `run_type` | string | 是 | 运行类型，见 [run_type](#task-run-type) |
| `status` | string | 是 | TaskStatus |
| `priority` | integer | 是 | 调度优先级，整数 `0..100`，数值越大越优先；默认 `50`。普通主体可设置 `0..50`，`51..100` 需要高优先级权限 |
| `queue_entered_at` | string | 是 | 当前一轮进入 pending 队列的时间；真正重新入队时重置，见 [Worker 协议](Worker协议与运行时.md#worker-protocol) |
| `next_dispatch_at` | string | 否 | 下一次允许自动派发的时间；`null` 表示暂停自动派发并等待人工处置 |
| `dispatch_attempts` | integer | 是 | 已成功建立 assignment 与容量预约的自动派发次数；默认 `0` |
| `entrypoint` | string | 是 | 入口文件，例如 `main.py` |
| `input_source` | string | 是 | 输入来源，见 [input_source](#task-input-source) |
| `input_params` | object | 否 | 小体积 JSON 输入参数 |
| `input_file_id` | string | 否 | 输入文件 ID，例如 Excel 文件；`input_source=file` 时使用 |
| `config` | object | 否 | 本次 Task 覆盖 Job Definition 默认配置的运行配置 |
| `requirements` | object | 否 | 本次运行要求，例如 runtime、image、capabilities、labels；缺省语义见 [Worker 协议](Worker协议与运行时.md#worker-protocol) |
| `timeout_seconds` | integer | 否 | Task 整体超时时间，未设置时使用 Job Definition 默认值或系统默认值 |
| `cancel_requested_at` | string | 否 | 用户请求取消时间 |
| `cancel_reason` | string | 否 | 取消原因 |
| `cancel_grace_period_seconds` | integer | 是 | 取消宽限期，默认 `30` |
| `dispatching_at` | string | 否 | 进入 dispatching 的时间 |
| `assignment_acked_at` | string | 否 | 当前 assignment 收到 accepted=true TaskAck 的时间 |
| `ack_deadline_at` | string | 否 | 当前 assignment 的 TaskAck 截止时间 |
| `start_deadline_at` | string | 否 | 当前 assignment 的 TaskStarted 截止时间 |
| `dispatch_deadline_at` | string | 否 | 兼容字段；新实现以 `ack_deadline_at` / `start_deadline_at` 为准 |
| `started_at` | string | 否 | Worker 开始执行脚本时间 |
| `finished_at` | string | 否 | Task 进入终态时间 |
| `timeout_at` | string | 否 | 系统判定整体超时的时间 |
| `created_by` | string | 是 | 创建人用户 ID 或 API token 主体 |
| `created_at` | string | 是 | 创建时间 |
| `updated_at` | string | 是 | 更新时间 |
| `summary` | object | 否 | 脚本或系统生成的摘要信息，用于详情页概览 |
| `error_code` | string | 否 | Task 执行错误码，取值及外露边界见 [错误标识注册表](错误标识注册表.md#error-registry) 表 B，例如 `SCRIPT_EXIT_NONZERO`；不是 REST `error.code` |
| `error_message` | string | 否 | 面向用户的简短错误说明，必须遵守 [安全基线](安全基线.md#security-baseline) 脱敏规则 |
| `error_detail` | object | 否 | 调试详情；返回给普通用户前必须脱敏，客户端不得依赖未登记结构做稳定分支 |

#### Task.statistics 统计字段

`Task.statistics` 不是一个单独的数值，而是一个表示整个 Task 汇总结果的统计对象：

```text
一个 Task
  -> 一个 Task.statistics 汇总对象
  -> 多个计数、比例和关联资源数量
```

以下字段属于 `Task.statistics`，不是 Task 顶层字段。它们由该 Task 下的全部 TaskItem 聚合得到，用于列表展示、详情展示和 Task 最终状态判定。

第一版只提供 Task 级总体统计，不在 `Task.statistics` 中按 Job Definition、TaskItem type、时间段或业务 key 再拆分统计。需要查看单条业务记录的状态和错误时，调用：

```http
GET /api/tasks/{task_id}/items
GET /api/tasks/{task_id}/items/{item_id}
```

因此统计层级是：

```text
Task.statistics
  = 当前 Task 下全部 TaskItem 的总体汇总

TaskItem
  = 单条业务明细，不属于 Task.statistics 的嵌套数组
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `total_items` | integer | TaskItem 总数，可运行中动态增长 |
| `pending_items` | integer | 未开始的 TaskItem 数 |
| `running_items` | integer | 正在处理的 TaskItem 数 |
| `success_items` | integer | 成功 TaskItem 数 |
| `failed_items` | integer | 失败 TaskItem 数 |
| `skipped_items` | integer | 跳过 TaskItem 数 |
| `canceled_items` | integer | 取消 TaskItem 数 |
| `timeout_items` | integer | 超时 TaskItem 数 |
| `completed_items` | integer | 已完成 TaskItem 数，等于 success + failed + skipped + canceled + timeout |
| `total_results` | integer | 该 Task 关联的结构化 Result 资源数量；不是 TaskItem 数量 |
| `artifact_count` | integer | 该 Task 关联的 Artifact 资源数量；不是 TaskItem 数量 |
| `log_count` | integer | 该 Task 关联的日志行数；不是 TaskItem 数量 |
| `error_log_count` | integer | 该 Task 关联的 error 级别日志行数；不是失败 TaskItem 数量 |
| `progress_rate` | number/null | `completed_items / total_items`；`total_items=0` 时返回 `null` |
| `success_rate` | number/null | `success_items / total_items` |
| `failed_rate` | number/null | `failed_items / total_items` |
| `timeout_rate` | number/null | `timeout_items / total_items` |
| `error_rate` | number/null | `(failed_items + timeout_items) / total_items` |

`total_items` 及各 `*_items` 字段只统计 TaskItem；`total_results`、`artifact_count`、`log_count`、`error_log_count` 统计关联输出资源或日志。一个 TaskItem 可以关联零个或多个 Result、Artifact 和日志，因此两组数量不得相加、互相推导，也不得用输出资源数量参与 TaskItem 百分比或 Task 最终状态裁定。

<a id="task-run-type"></a>
### run_type

第一版支持：

| 值 | 含义 | 创建来源 |
|---|---|---|
| `manual` | 人工在后台点击运行 | Job Definition 详情页 / Task 创建页 |
| `schedule` | Schedule 到点触发 | Schedule Runner |
| `retry_all` | 对原 Task 全量重试 | Retry API |
| `retry_failed_items` | 只重试失败/超时 TaskItem | Retry API |
| `rerun` | 成功或任意历史 Task 重新执行 | Rerun 操作 |
| `api` | 外部系统调用 API 创建 | External API |

<a id="task-input-source"></a>
### input_source

第一版支持：

| 值 | 含义 | 相关字段 |
|---|---|---|
| `file` | 输入来自上传文件，例如 Excel | `input_file_id` |
| `params` | 输入来自 JSON 参数 | `input_params` |
| `task_items` | 输入来自旧 Task 的部分 TaskItem | `source_task_id`、系统生成的 retry input；构造行为见 [重试 Task](#retry-task)，持久化章节只记录现有投影 |
| `none` | 无显式输入 | 无 |

约束：

```text
input_source = file       时，input_file_id 必填
input_source = params     时，input_params 必填或默认为 {}
input_source = task_items 时，source_task_id 必填，且只能由 retry_failed_items 创建
input_source = none       时，不应传 input_file_id
```

<a id="create-task"></a>
### 创建 Task

```http
POST /api/tasks
```

请求字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `bot_id` | string | 是 | - | 要运行的 Job Definition |
| `bot_version_id` | string | 否 | 当前版本 | 指定版本；不传则使用 Job Definition 当前启用版本 |
| `run_type` | string | 否 | `manual` 或 `api` | 后台手动创建为 `manual`，外部 token 创建为 `api` |
| `input_source` | string | 是 | - | 输入来源 |
| `input_file_id` | string | 否 | `null` | 已通过 `POST /api/files` 上传的输入文件 ID，见 [Source File API](./源文件.md#source-file-api) |
| `input_params` | object | 否 | `{}` | JSON 参数 |
| `config` | object | 否 | `{}` | 本次运行配置覆盖项 |
| `requirements` | object | 否 | `{}` | 本次运行要求覆盖项 |
| `priority` | integer | 否 | `50` | 调度优先级，合法范围 `0..100`；普通主体仅可设置 `0..50`，`51..100` 需高优先级权限 |
| `timeout_seconds` | integer | 否 | Job Definition 默认值 | 整体超时 |
| `idempotency_key` | string | 否 | `null` | 外部系统防重复创建；同一创建主体下唯一；各入口作用域与存储由 [`ALIGN-013`](待对齐问题.md#align-013) 跟踪 |

请求示例：

```json
{
  "bot_id": "bot_oem_approval",
  "input_source": "file",
  "input_file_id": "file_20260714_excel",
  "config": {
    "dry_run": false
  },
  "requirements": {
    "runtime": "python3.12",
    "capabilities": ["selenium", "chromium"],
    "labels": {
      "region": "cn-east"
    }
  },
  "timeout_seconds": 3600,
  "priority": 50,
  "idempotency_key": "external-order-20260714-001"
}
```

响应：

```json
{
  "data": {
    "id": "task_xxx",
    "bot_id": "bot_oem_approval",
    "run_type": "manual",
    "status": "pending",
    "input_source": "file",
    "created_at": "2026-07-14T10:30:00Z"
  }
}
```

创建成功只表示 Task 进入调度队列：

```text
Task.status = pending
queue_entered_at = created_at
next_dispatch_at = created_at
dispatch_attempts = 0
priority = 请求值或默认 50
```

`priority` 超出 `0..100` 返回 `422 INVALID_INPUT`；无高优先级权限却设置 `51..100` 返回 `403 FORBIDDEN`。创建成功不表示 Worker 已经开始执行。

<a id="list-tasks"></a>
### 查询 Task 列表

```http
GET /api/tasks
```

该接口返回一个分页结果，不是单个 Task 对象：

```json
{
  "data": [
    {
      "id": "task_001",
      "bot_id": "bot_oem_approval",
      "status": "success",
      "statistics": {
        "total_items": 100,
        "completed_items": 100,
        "success_items": 100,
        "progress_rate": 1.0,
        "success_rate": 1.0,
        "error_rate": 0.0
      }
    },
    {
      "id": "task_002",
      "bot_id": "bot_oem_approval",
      "status": "running",
      "statistics": {
        "total_items": 50,
        "completed_items": 20,
        "success_items": 19,
        "failed_items": 1,
        "progress_rate": 0.4,
        "success_rate": 0.38,
        "error_rate": 0.02
      }
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 2
  },
  "request_id": "req_xxx"
}
```

其中：

```text
data      = 当前页的 TaskListItem 数组
pagination.total = 满足过滤条件的 Task 总数，而不是当前页数量
```

Query 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `bot_id` | string | 按 Job Definition 过滤 |
| `status` | string | 按单个状态过滤 |
| `statuses` | string | 多状态过滤，逗号分隔，例如 `pending,running` |
| `run_type` | string | 按运行类型过滤 |
| `worker_id` | string | 按 Worker 过滤 |
| `schedule_id` | string | 按 Schedule 过滤 |
| `source_task_id` | string | 查询某个 Task 派生出的重试/重跑 Task |
| `created_by` | string | 按创建人过滤 |
| `q` | string | 搜索 task ID、作业定义编码、summary |

列表项必须返回足够支撑列表页的信息。这里的统计字段位于 `statistics` 子对象中：

```json
{
  "id": "task_xxx",
  "bot_id": "bot_oem_approval",
  "bot_code": "oem_approval",
  "run_type": "manual",
  "status": "running",
  "worker_id": "worker-01",
  "created_at": "2026-07-14T10:30:00Z",
  "started_at": "2026-07-14T10:31:00Z",
  "statistics": {
    "total_items": 100,
    "completed_items": 80,
    "success_items": 78,
    "failed_items": 2,
    "timeout_items": 0,
    "progress_rate": 0.8,
    "success_rate": 0.78,
    "error_rate": 0.02
  },
  "error_code": null,
  "error_message": null
}
```

列表接口默认不返回以下大字段或详情字段：

```text
bot_snapshot
input_params
config
requirements
error_detail
summary
操作能力字段
```

<a id="get-task"></a>
### 查询 Task 详情

```http
GET /api/tasks/{task_id}
```

该接口返回单个 Task 的完整详情，并且包含该 Task 的总体统计结果。统计结果位于返回对象的 `statistics` 字段中：

```json
{
  "data": {
    "id": "task_xxx",
    "bot_id": "bot_oem_approval",
    "status": "partial_success",
    "run_type": "manual",
    "statistics": {
      "total_items": 100,
      "pending_items": 0,
      "running_items": 0,
      "success_items": 80,
      "failed_items": 15,
      "skipped_items": 3,
      "canceled_items": 0,
      "timeout_items": 2,
      "completed_items": 100,
      "progress_rate": 1.0,
      "success_rate": 0.8,
      "failed_rate": 0.15,
      "timeout_rate": 0.02,
      "error_rate": 0.17
    }
  },
  "request_id": "req_xxx"
}
```

详情页响应应包含完整的 `TaskDetail`：

| 字段组 | 说明 |
|---|---|
| 基础信息 | Task 对象的基础字段 |
| Job Definition 快照 | `bot_snapshot`，展示当时执行的 Job Definition 稳定编码、版本、入口文件 |
| 输入摘要 | `input_source`、`input_file_id`、`input_params` 摘要，敏感字段脱敏 |
| 运行配置 | `config`、`requirements` |
| 调度信息 | `worker_id`、`assignment_id`、`priority`、`queue_entered_at`、`next_dispatch_at`、`dispatch_attempts`、dispatch 时间、Ack/Start deadline、start/finish 时间 |
| 统计信息 | 完整的 `statistics` 子对象，包括所有计数和百分比字段 |
| 错误信息 | `error_code`、`error_message`、`error_detail` |
| 操作能力 | `can_cancel`、`can_retry`、`can_rerun`、`can_resume_dispatch`，由后端根据状态和权限计算 |

因此：

```text
TaskListItem 和 TaskDetail 不是两个业务资源，
而是同一个 Task 资源的列表投影和详情投影。
```

<a id="cancel-task"></a>
### 取消 Task

```http
POST /api/tasks/{task_id}/cancel
```

请求字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `reason` | string | 否 | `user_requested` | 取消原因 |
| `cancel_grace_period_seconds` | integer | 否 | `30` | 优雅退出等待时间 |

可取消状态：

```text
pending
dispatching
running
canceling  # 幂等返回当前取消中状态
```

不可取消状态：

```text
success
partial_success
failed
canceled
timeout
```

取消处理按当前状态区分：

```text
pending:
  直接 canceled；不再进入自动派发

dispatching:
  先持久化取消意图；具体状态路径见下方待对齐说明
  禁止 deadline / offline / disable 回收把它重新排回 pending
  失效当前 assignment 并释放 reservation
  若 Worker 可能已收到 AssignTask：发送 AbortAssignment 和/或 CancelTask
  不得生成新的自动派发 assignment

running:
  Worker 通知 Python 进程优雅退出
  等待 cancel_grace_period
  超时后强制终止
  Task 最终变为 canceled
  已终态 TaskItem 保持原状态
  未终态 TaskItem 标记为 canceled
```

取消优先于 Ack/Start deadline、Worker offline 和 Worker disable 的派发前回收。若合法 `TaskStarted` 与取消并发，仍以 [Task 最终状态裁定规则](#task-terminal-arbitration) 中首先成功提交的合法事务为准；一旦取消意图先持久化为 `canceling`，迟到的 `TaskStarted` 不得把 Task 改回 `running`。`dispatching` 取消究竟直接进入 `canceled` 还是统一经过 `canceling`，仍由 [`ALIGN-005`：派发中取消的状态路径](待对齐问题.md#align-005) 跟踪，本接口不得独立补定。

响应字段：

| 字段 | 说明 |
|---|---|
| `id` | Task ID |
| `status` | `canceled` 或 `canceling` |
| `cancel_requested_at` | 取消请求时间 |
| `cancel_reason` | 取消原因 |

<a id="retry-task"></a>
### 重试 Task

```http
POST /api/tasks/{task_id}/retry
```

重试永远创建新 Task，不修改原 Task。

请求字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `mode` | string | 是 | - | `all` 或 `failed_items` |
| `reason` | string | 否 | `user_requested` | 重试原因 |
| `config` | object | 否 | 原 Task config | 可覆盖新 Task 的运行配置 |
| `requirements` | object | 否 | 原 Task requirements | 可覆盖新 Task 的运行要求 |
| `priority` | integer | 否 | 原 Task priority | 新 Task 优先级；合法范围与权限规则同创建 Task |
| `idempotency_key` | string | 否 | `null` | 防重复创建 |

支持模式：

| mode | 新 Task run_type | 输入构造 |
|---|---|---|
| `all` | `retry_all` | 复用原 Task 的 input_source、input_file_id、input_params |
| `failed_items` | `retry_failed_items` | 从原 Task 中筛选 `failed`、`timeout` 的 TaskItem 构造输入 |

`failed_items` 模式在本节只定稿“从原 Task 的失败/超时 TaskItem 构造新 Task 输入”的 API 行为；当前 [Task 持久化投影](#persistence-map) 不据此新增快照字段、序列化格式或重放契约。版本选择、输入快照及已删除 Source File 的继承边界由 [`ALIGN-010`](待对齐问题.md#align-010) 跟踪。

新 Task 创建成功后同样进入调度队列：

```text
status = pending
queue_entered_at = created_at
next_dispatch_at = created_at
dispatch_attempts = 0
```

可重试状态：

```text
failed
partial_success
timeout
canceled
```

重试资格只按上述 `Task.status` 判断。[错误标识注册表](错误标识注册表.md#error-registry) 表 B 中的执行错误码和 Worker 上报的 `TaskFailed.retriable` 只能提供诊断或提示，不能单独授予平台自动改派、自动重试或额外的 REST retry 资格。

失败项重试范围：

```text
failed
timeout
```

不包括：

```text
success
skipped
canceled
```

成功或任意历史终态 Task 的全量重新执行使用 `rerun`，见 [重新执行 Task](#rerun-task)，不叫 retry。

响应返回新 Task：

```json
{
  "data": {
    "id": "task_new",
    "source_task_id": "task_old",
    "run_type": "retry_failed_items",
    "status": "pending"
  }
}
```

<a id="rerun-task"></a>
### 重新执行 Task

```http
POST /api/tasks/{task_id}/rerun
```

`rerun` 表示按原 Task 的完整输入重新执行一次，永远创建新 Task，不修改原 Task。

与 `retry` 的区别：

```text
retry  面向失败场景：失败/部分成功/超时/取消后的补救
       mode=all            -> run_type=retry_all
       mode=failed_items   -> run_type=retry_failed_items

rerun  面向任意终态的再次执行，包括成功任务
       始终全量复用原输入                 -> run_type=rerun
```

请求字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `reason` | string | 否 | `user_requested` | 重新执行原因 |
| `config` | object | 否 | 原 Task config | 可覆盖新 Task 的运行配置 |
| `requirements` | object | 否 | 原 Task requirements | 可覆盖新 Task 的运行要求 |
| `priority` | integer | 否 | 原 Task priority | 新 Task 优先级；合法范围与权限规则同创建 Task |
| `bot_version_id` | string | 否 | 原 Task bot_version_id | 可指定使用 Job Definition 当前版本或其他历史版本 |
| `idempotency_key` | string | 否 | `null` | 防重复创建 |

输入构造：

```text
复用原 Task 的 input_source、input_file_id、input_params
不按 TaskItem 过滤；始终全量输入
新 Task.source_task_id = 原 Task ID
新 Task.run_type = rerun
新 Task.status = pending
新 Task.queue_entered_at = created_at
新 Task.next_dispatch_at = created_at
新 Task.dispatch_attempts = 0
```

若原 Task 的 `input_source=task_items`（来自某次 failed_items 重试），`rerun` 仍复用该次 Task 的输入快照，而不是回溯到更早的祖先 Task。需要全量业务输入时，应对最初的源 Task 执行 `rerun`，或对失败源 Task 使用 `retry` 且 `mode=all`。

> [待对齐｜不在本次范围]
> Job Definition Version 选择、失败项稳定输入快照以及继承的 Source File 已删除或不可下载时的处理，由 [`ALIGN-010`](待对齐问题.md#align-010) 跟踪；本节不从现有表结构推导新行为。

可重新执行状态：

```text
success
partial_success
failed
timeout
canceled
```

不可重新执行状态：

```text
pending
dispatching
running
canceling
```

操作能力字段：

```text
can_rerun = 原 Task 处于上述可重新执行终态，且当前用户有运行该 Job Definition 的权限
```

`can_retry` 与 `can_rerun` 可以同时为 true，例如 `partial_success`：

```text
can_retry = true   # 可只重试失败项，或全量 retry_all
can_rerun = true   # 也可作为一次新的全量重新执行
```

前端建议：

```text
失败类终态：优先展示 Retry，并提供 Rerun 作为次要操作
成功终态：只展示 Rerun
```

响应返回新 Task：

```json
{
  "data": {
    "id": "task_new",
    "source_task_id": "task_old",
    "run_type": "rerun",
    "status": "pending",
    "input_source": "file",
    "created_at": "2026-07-15T12:00:00Z"
  },
  "request_id": "req_xxx"
}
```

<a id="resume-task-dispatch"></a>
### 恢复自动派发

```http
POST /api/tasks/{task_id}/resume-dispatch
```

该接口用于恢复**同一个**仍处于 `pending` 的 Task 的自动派发，不创建新 Task，也不改变 Job Definition 快照、输入、TaskItem 或终态语义。它面向达到最大派发次数、长期无候选后被暂停自动调度的运维场景，与 [Task API](Task执行规范.md#task-api) 的终态 retry 不同。

请求字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `reason` | string | 否 | `manual_resume` | 运维填写的恢复说明；写入 `task_event.metadata.request_reason`，不作为稳定事件原因码 |

允许状态：

```text
pending
```

其他状态返回 `409 STATE_CONFLICT`。

权限：

```text
仅管理员或任务运维角色
```

成功后的原子处理：

```text
dispatch_attempts = 0
queue_entered_at = now
next_dispatch_at = now
写 task_event.reason = DISPATCH_MANUALLY_RESUMED
写 task_event.metadata.request_reason = 请求 reason
```

操作能力字段：

```text
can_resume_dispatch =
  Task.status = pending
  且当前主体具备任务运维权限
  且 (next_dispatch_at is null 或 dispatch_attempts 已达到上限，或运维明确需要强制重新排队)
```

响应示例：

```json
{
  "data": {
    "id": "task_xxx",
    "status": "pending",
    "dispatch_attempts": 0,
    "queue_entered_at": "2026-07-15T13:00:00Z",
    "next_dispatch_at": "2026-07-15T13:00:00Z",
    "updated_at": "2026-07-15T13:00:00Z"
  },
  "request_id": "req_xxx"
}
```

---

<a id="task-item-api"></a>
## TaskItem API 定稿

> [重复摘要｜非规范性]
> 本节保留 TaskItem 含义作为 API 上下文，不重新定义领域模型或状态迁移。TaskItem 核心含义见 [Task 模型](Task执行规范.md#task-model)，`TaskItem.status` 见 [TaskItem 状态机](Task执行规范.md#task-item-status)，聚合统计见 [统计规则](Task执行规范.md#task-statistics)；本节负责 TaskItem 的 REST 查询契约。

TaskItem 表示脚本运行过程中动态上报的执行明细，是观测和统计单元，不是第一版调度单元。

### 接口索引

本节只列出接口路径。TaskItem 的共享字段定义与每个接口的详细说明分开描述。

| 方法 | 路径 | 用途 | 详细说明 |
|---|---|---|---|
| `GET` | `/api/tasks/{task_id}/items` | 查询 TaskItem 列表 | [查询 TaskItem 列表](#list-task-items) |
| `GET` | `/api/tasks/{task_id}/items/{item_id}` | 查询 TaskItem 详情 | [查询 TaskItem 详情](#get-task-item) |
| `GET` | `/api/tasks/{task_id}/items/{item_id}/logs` | 查询 TaskItem 日志 | [Log API](结果-产物-日志.md#log-api) |
| `GET` | `/api/tasks/{task_id}/items/{item_id}/results` | 查询 TaskItem Result | [Result API](结果-产物-日志.md#result-api) |
| `GET` | `/api/tasks/{task_id}/items/{item_id}/artifacts` | 查询 TaskItem Artifact | [Artifact API](结果-产物-日志.md#artifact-api) |

第一版不提供：

```http
PATCH /api/task-items/{item_id}
POST  /api/task-items/{item_id}/cancel
POST  /api/task-items/{item_id}/retry
```

### 共享返回对象：TaskItem

以下字段表定义 `GET /api/tasks/{task_id}/items` 和 `GET /api/tasks/{task_id}/items/{item_id}` 返回的 TaskItem 对象。它不是创建或更新接口的请求体定义。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | TaskItem ID |
| `task_id` | string | 是 | 所属 Task ID |
| `bot_id` | string | 是 | 冗余 Job Definition ID，便于查询 |
| `type` | string | 是 | 明细类型，推荐值见 [TaskItem type 推荐值](#task-item-types) |
| `key` | string | 否 | 业务唯一键，例如 Excel 行号、URL、外部单号 |
| `index` | integer | 否 | 顺序号，从 0 开始，前端展示为 `index + 1` |
| `status` | string | 是 | TaskItemStatus |
| `input_data` | object | 否 | 单项输入数据，敏感字段必须脱敏或避免写入 |
| `output_data` | object | 否 | 单项输出摘要，不保存大文件内容 |
| `error_code` | string | 否 | TaskItem 执行错误码，取值及外露边界见 [错误标识注册表](错误标识注册表.md#error-registry) 表 B；例如 `ITEM_NOT_FINALIZED`，不是 REST `error.code` |
| `error_message` | string | 否 | 单项失败简短说明，必须遵守 [安全基线](安全基线.md#security-baseline) 脱敏规则 |
| `error_detail` | object | 否 | 单项失败详情，必须可脱敏，客户端不得依赖未登记结构做稳定分支 |
| `summary` | object | 否 | 面向详情页展示的业务摘要 |
| `idempotency_key` | string | 否 | SDK 上报幂等键，同一 Task 内唯一 |
| `result_count` | integer | 是 | 关联 Result 数量 |
| `artifact_count` | integer | 是 | 关联 Artifact 数量 |
| `log_count` | integer | 是 | 关联日志数量 |
| `error_log_count` | integer | 是 | 关联 error 日志数量 |
| `created_at` | string | 是 | 创建时间 |
| `started_at` | string | 否 | 开始处理时间 |
| `finished_at` | string | 否 | 进入终态时间 |
| `duration_ms` | integer | 否 | 执行耗时，毫秒 |
| `updated_at` | string | 是 | 更新时间 |

<a id="task-item-types"></a>
### TaskItem type 推荐值

`type` 不强枚举，推荐值：

| 值 | 含义 | 示例 |
|---|---|---|
| `record` | 一条业务记录 | Excel 中一行审批记录 |
| `url` | 一个 URL | 商品详情页 URL |
| `page` | 一个页面或分页 | 第 3 页列表 |
| `query` | 一个查询条件 | 订单号 / VIN |
| `file` | 一个文件 | 待上传附件 |
| `step` | 一个处理步骤 | 登录、提交、校验 |
| `custom` | 自定义类型 | 业务方自定义 |

<a id="list-task-items"></a>
### 查询 TaskItem 列表

```http
GET /api/tasks/{task_id}/items
```

Query 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `status` | string | 单状态过滤 |
| `statuses` | string | 多状态过滤，逗号分隔 |
| `type` | string | 按 TaskItem 类型过滤 |
| `key` | string | 按业务 key 精确查询 |
| `q` | string | 搜索 key、summary、error_message |
| `has_error` | boolean | 是否只看有错误的 item |
| `sort` | string | 默认 `index`，也可 `-created_at`、`-finished_at` |

列表项至少返回：

```text
id, task_id, type, key, index, status,
summary, error_code, error_message,
result_count, artifact_count, log_count,
created_at, started_at, finished_at, duration_ms
```

<a id="get-task-item"></a>
### 查询 TaskItem 详情

```http
GET /api/tasks/{task_id}/items/{item_id}
```

详情页响应应包含完整 TaskItem 对象，并可以附带最近日志摘要：

| 字段 | 说明 |
|---|---|
| `data` | TaskItem 完整对象 |
| `recent_logs` | 最近 N 条日志，可选，前端也可以单独调用 logs 接口 |
| `related_results_count` | 关联 Result 数量 |
| `related_artifacts_count` | 关联 Artifact 数量 |

---

<a id="persistence-map"></a>
## 持久化映射说明

> [持久化投影]
> 本节仅记录 `tasks`、`task_items` 和 `task_events` 对领域、API 与协议对象的持久化投影，不反向定义 Task / TaskItem 状态、REST 或 Worker 协议语义。

Task API 使用的 `input_file_id` 尚未完整映射到当前 `tasks` 字段清单，见 [`ALIGN-001`：Task 输入文件字段映射](待对齐问题.md#align-001)。在该 issue 关闭前，本持久化投影不擅自新增字段、外键或历史保留契约，也不改变 [Task 输入来源](#task-input-source) 与 [创建 Task](#create-task) 的现行 API 语义。

### tasks（持久化投影）

字段：

```text
id
bot_id
bot_code
bot_version_id
bot_snapshot
source_task_id
schedule_id
schedule_run_id
worker_id
assignment_id
run_type
status
priority
script_source
entrypoint
input_source
input_params
config
requirements
total_items
pending_items
running_items
success_items
failed_items
skipped_items
canceled_items
timeout_items
completed_items
total_results
artifact_count
log_count
error_log_count
progress_rate
success_rate
failed_rate
timeout_rate
error_rate
summary
error_code
error_message
error_detail
cancel_requested_at
cancel_reason
cancel_grace_period_seconds
queue_entered_at
next_dispatch_at
dispatch_attempts
dispatching_at
assignment_acked_at
ack_deadline_at
start_deadline_at
dispatch_deadline_at
started_at
finished_at
timeout_at
created_by
created_at
updated_at
```

说明：

```text
queue_entered_at / next_dispatch_at / dispatch_attempts 服务 pending 调度
assignment_acked_at / ack_deadline_at / start_deadline_at 服务派发两阶段
dispatch_deadline_at 为兼容字段；新实现以 ack/start deadline 为准
本节只补充调度必需字段映射，不展开完整类型、DDL 或索引优化
```

索引：

```text
index(bot_id, created_at)
index(status, created_at)
index(run_type, created_at)
index(worker_id, status)
index(schedule_id, created_at)
index(schedule_run_id)
index(source_task_id)
index(created_by, created_at)
index(priority, created_at)
index(assignment_id)
index(status, priority, created_at)
index(status, next_dispatch_at, queue_entered_at)
```

---

### task_items（持久化投影）

字段：

```text
id
task_id
bot_id
type
key
index
status
input_data
output_data
error_code
error_message
error_detail
summary
idempotency_key
result_count
artifact_count
log_count
error_log_count
created_at
started_at
finished_at
duration_ms
updated_at
```

索引：

```text
index(task_id, index)
index(task_id, status)
index(task_id, type)
index(task_id, key)
index(bot_id, created_at)
unique(task_id, idempotency_key)
index(created_at)
index(task_id, status, created_at)
```

---

### task_events（持久化投影）

> [本节角色]
> `from_status` / `to_status` 记录 `Task.status` 的迁移，取值与合法迁移以 [Task 状态机](Task执行规范.md#task-status) 为准；该表不用于记录 `TaskItem.status`、Worker 本地状态或其他资源状态。

字段：

```text
id
task_id
from_status
to_status
reason
message
metadata
created_by
created_at
```

调度相关 `reason` 至少覆盖 [错误标识注册表](错误标识注册表.md#error-registry) 表 C 中登记的：

```text
DISPATCH_RESERVED
TASK_ACK_ACCEPTED
TASK_ACK_REJECTED
ACK_DEADLINE_EXPIRED
START_DEADLINE_EXPIRED
NO_CANDIDATE_WORKER
DISPATCH_REQUEUED
DISPATCH_ATTEMPTS_EXHAUSTED
WORKER_OFFLINE_RECLAIM
WORKER_DISABLED_RECLAIM
ASSIGNMENT_ABORT_REQUESTED
RECONCILIATION_ABORT
DISPATCH_MANUALLY_RESUMED
```

`metadata` 可记录 assignment、Worker、attempt、deadline、退避、候选数和容量快照；禁止写入 token、认证头、签名下载 URL、secret 或未脱敏配置。纯调度观察事件允许 `from_status=to_status`，例如 `pending -> pending`。

索引：

```text
index(task_id, created_at)
index(created_at)
index(to_status)
```

---
