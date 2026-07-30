# JobOps V1：Schedules

Schedule 让 Job Definition 按 cron 规则定时自动创建 Task，无需人工每次手动触发。用户可以配置执行时区、随机延迟（jitter）、上一轮未完成时的重叠策略和错过触发时间的补跑策略；每一次触发决策都会生成一条 ScheduleRun 记录，便于追溯“什么时候触发了、是否创建了 Task、为什么被跳过”。Schedule 也支持随时手动触发一次，不影响既有 cron 计划。

> [本文件角色]
> 本文件定义 Schedule / ScheduleRun 的触发规则、重叠与 missed run 策略、jitter、REST 契约和持久化映射。生成的 Task 仍必须遵守 [Task执行规范.md](Task执行规范.md#task-status) 的状态机和终态规则。
> 本文件中的完整定义是对应主题的唯一规范来源；其他文档只保留摘要、传输映射或存储映射，并通过链接回到本文件。

## 快速导航

[Schedule API](#schedule-api) · [触发规则](#schedule-trigger) · [持久化映射](#persistence-map)

<a id="schedule-api"></a>
## Schedule API 定稿

> [本节角色]
> 本节定义 Schedule / ScheduleRun 的 REST 资源、触发决策和创建 Task 的规则。生成后的 Task 核心含义、状态与统计仍分别以 [Task 模型](Task执行规范.md#task-model)、[Task 状态机](Task执行规范.md#task-status) 和 [统计规则](Task执行规范.md#task-statistics) 为准。

Schedule 是定时触发规则，不是执行记录。

> [重复摘要｜非规范性]
> 下列关系用于说明资源关联，不重定义 Job Definition 或 Task；Job Definition 与 Task 的核心含义见 [核心模型](平台概览.md#core-model)，Schedule / ScheduleRun 的字段及行为由本节后续小节定义。

关系：

```text
Job Definition -> Schedule -> ScheduleRun -> Task
```

### 接口索引

本节只列出接口路径和用途。`Schedule`、`ScheduleRun` 的共享返回字段与每个接口的请求字段分开定义。

| 方法 | 路径 | 用途 | 详细说明 |
|---|---|---|---|
| `POST` | `/api/schedules` | 创建 Schedule | [创建 Schedule](#create-schedule) |
| `GET` | `/api/schedules` | 分页查询 Schedule | [查询 Schedule 列表](#list-schedules) |
| `GET` | `/api/schedules/{schedule_id}` | 查询 Schedule 详情 | [查询 Schedule 详情](#get-schedule) |
| `PATCH` | `/api/schedules/{schedule_id}` | 更新 Schedule | [更新 / 启停 Schedule](#update-schedule) |
| `POST` | `/api/schedules/{schedule_id}/enable` | 启用 Schedule | [更新 / 启停 Schedule](#update-schedule) |
| `POST` | `/api/schedules/{schedule_id}/disable` | 禁用 Schedule | [更新 / 启停 Schedule](#update-schedule) |
| `POST` | `/api/schedules/{schedule_id}/trigger` | 立即手动触发一次 | [手动触发 Schedule](#trigger-schedule) |
| `GET` | `/api/schedules/{schedule_id}/runs` | 查询 ScheduleRun 列表 | [ScheduleRun 接口](#schedule-run-api) |
| `GET` | `/api/schedule-runs/{run_id}` | 查询 ScheduleRun 详情 | [ScheduleRun 接口](#schedule-run-api) |

### 共享返回对象：Schedule

以下字段表定义 Schedule 列表和详情接口返回的 Schedule 对象。创建、更新和触发接口只使用其中一部分字段，具体以对应小节为准。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | Schedule ID |
| `name` | string | 是 | 定时任务名称 |
| `description` | string | 否 | 说明 |
| `bot_id` | string | 是 | 被触发的 Job Definition |
| `bot_version_id` | string | 否 | 固定版本；为空表示触发时使用 Job Definition 当前启用版本 |
| `cron` | string | 是 | 标准 5 段 cron 表达式 |
| `timezone` | string | 是 | cron 解释时区，例如 `Asia/Shanghai` |
| `input_source` | string | 是 | 每次触发创建 Task 时的输入来源 |
| `input_file_id` | string | 否 | 定时执行固定输入文件时使用；也可为空，由脚本自行拉取数据 |
| `input_params` | object | 否 | 每次触发传给 Task 的 JSON 参数 |
| `config` | object | 否 | 每次触发传给 Task 的运行配置覆盖项 |
| `requirements` | object | 否 | 每次触发传给 Task 的运行要求覆盖项 |
| `overlap_policy` | string | 是 | 到点时上一轮未完成的处理策略 |
| `missed_run_policy` | string | 是 | Master 停机或延迟导致错过触发时间时的处理策略 |
| `jitter_seconds` | integer | 是 | 最大随机延迟秒数；每次触发实际延迟范围为 `0` 到该值 |
| `max_parallel_runs` | integer | 是 | `overlap_policy=parallel` 时允许的最大并行 Task 数 |
| `status` | string | 是 | ScheduleStatus |
| `last_run_at` | string | 否 | 最近一次触发决策时间，不一定创建了 Task |
| `last_task_id` | string | 否 | 最近一次成功创建的 Task ID |
| `next_planned_at` | string | 否 | 下一次 cron 理论触发时间，不包含随机延迟 |
| `next_run_at` | string | 否 | 下一次实际计划执行时间，包含随机延迟，用于前端展示 |
| `created_by` | string | 是 | 创建人 |
| `created_at` | string | 是 | 创建时间 |
| `updated_at` | string | 是 | 更新时间 |
| `archived_at` | string | 否 | 归档时间 |

cron 使用标准 5 段表达式：

```text
minute hour day-of-month month day-of-week
```

cron 按 `timezone` 解释。第一版不建议使用秒级 cron，避免调度频率过高。

ScheduleStatus：

| 值 | 含义 |
|---|---|
| `enabled` | 启用，到点会触发 |
| `disabled` | 禁用，到点不会触发 |
| `archived` | 归档，默认列表隐藏且不可触发 |

<a id="schedule-trigger"></a>
### 触发策略

<a id="schedule-overlap-policy"></a>
#### overlap_policy

| 值 | 含义 | 第一版建议 |
|---|---|---|
| `skip` | 如果上一轮仍有 active Task，本轮跳过，只记录 ScheduleRun | MVP 默认实现 |
| `queue` | 到点后排队，等上一轮结束再创建 Task | 预留 |
| `replace` | 取消上一轮并创建新 Task | 预留，风险较高 |
| `parallel` | 允许并行创建多个 Task | 可作为后续增强 |

`replace` 涉及派发中 Task 的取消路径，继续受 [`ALIGN-005`：派发中取消的状态路径](待对齐问题.md#align-005) 约束。`queue`、`parallel` 以及这些策略与失败恢复、手动触发的组合边界由 [`ALIGN-008`](待对齐问题.md#align-008) 跟踪；本文件保留现有枚举与 MVP 默认值，不补写未决行为。

`active Task` 指尚未进入 [Task 终态集合](Task执行规范.md#task-terminal-statuses) 的 Task；本文件不复制维护 Task 状态枚举。

第一版默认：

```text
overlap_policy = skip
```

<a id="schedule-missed-run-policy"></a>
#### missed_run_policy

| 值 | 含义 |
|---|---|
| `skip` | 错过的触发不补跑 |
| `run_once` | 如果错过多次，只补跑一次 |

第一版默认值定稿为：

```text
missed_run_policy = skip
```

理由：Master 停机恢复后若自动补跑，容易与积压 Task 叠加形成调度风暴。业务不能漏跑时，可在创建/更新 Schedule 时显式配置 `run_once`；使用 `run_once` 时必须在 ScheduleRun 中记录补跑原因（例如 `missed_run_catchup`）。`run_once` 与 overlap、jitter、禁用/重启边界的组合语义由 [`ALIGN-008`](待对齐问题.md#align-008) 跟踪；本节不提前补齐这些业务选择。

<a id="schedule-jitter"></a>
#### jitter_seconds：随机延迟

为了避免多个 Schedule 总是在同一整点同时执行，可以增加随机延迟配置：

```text
jitter_seconds = 0       不增加随机延迟
jitter_seconds = 300     每次触发随机延迟 0～300 秒
jitter_seconds = 1800    每次触发随机延迟 0～1800 秒
```

推荐语义：

```text
nominal_time = cron 按 timezone 计算出的理论触发时间
actual_time  = nominal_time + random(0, jitter_seconds)
```

规则：

```text
只允许向后延迟，不提前运行
随机延迟使用整数秒，范围包含 0 和 jitter_seconds
每个 ScheduleRun 只生成一次随机值
生成后的 jitter 值和 actual_time 必须持久化
Master 重启后继续使用已持久化的 actual_time，不重新随机
overlap_policy 在 actual_time 到达时判断，而不是在 nominal_time 判断
jitter_seconds 修改只影响后续 ScheduleRun，不改变已生成的 ScheduleRun
```

ScheduleRun 应记录：

```text
planned_at              = nominal_time
scheduled_at            = actual_time
jitter_seconds          = 本次使用的配置上限
jitter_applied_seconds  = 本次实际随机延迟
triggered_at            = 实际执行触发决策的时间
```

示例：

```text
cron: 0 9 * * *
timezone: Asia/Shanghai
jitter_seconds: 300

planned_at: 2026-07-15T09:00:00+08:00
jitter_applied_seconds: 127
scheduled_at: 2026-07-15T09:02:07+08:00
```

不建议第一版支持负数随机偏移，因为提前执行会让用户误以为任务违反了 cron 规则，也会增加 missed run 和重叠判断的复杂度。

<a id="create-schedule"></a>
### 创建 Schedule

```http
POST /api/schedules
```

请求字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `name` | string | 是 | - | Schedule 名称 |
| `description` | string | 否 | `null` | 描述 |
| `bot_id` | string | 是 | - | 目标 Job Definition |
| `bot_version_id` | string | 否 | `null` | 固定执行版本 |
| `cron` | string | 是 | - | 5 段 cron |
| `timezone` | string | 否 | `Asia/Shanghai` | 时区 |
| `input_source` | string | 是 | - | 输入来源 |
| `input_file_id` | string | 否 | `null` | 输入文件 |
| `input_params` | object | 否 | `{}` | JSON 输入参数 |
| `config` | object | 否 | `{}` | 运行配置 |
| `requirements` | object | 否 | `{}` | 运行要求 |
| `overlap_policy` | string | 否 | `skip` | 重叠策略 |
| `missed_run_policy` | string | 否 | `skip` | 错过触发策略 |
| `jitter_seconds` | integer | 否 | `0` | 最大随机延迟秒数，必须大于等于 `0` |
| `max_parallel_runs` | integer | 否 | `1` | 最大并行数 |
| `enabled` | boolean | 否 | `true` | 是否创建后立即启用 |

请求示例：

```json
{
  "name": "每天 9 点提交审批",
  "bot_id": "bot_oem_approval",
  "cron": "0 9 * * *",
  "timezone": "Asia/Shanghai",
  "input_source": "params",
  "input_params": {
    "business_date": "today"
  },
  "overlap_policy": "skip",
  "missed_run_policy": "skip",
  "jitter_seconds": 300
}
```

创建成功后返回 Schedule 对象，并计算下一次理论触发时间；具体 ScheduleRun 的随机延迟在该次运行记录中保存。

<a id="list-schedules"></a>
### 查询 Schedule 列表

```http
GET /api/schedules
```

Query 字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `bot_id` | string | 按 Job Definition 过滤 |
| `status` | string | `enabled`、`disabled`、`archived` |
| `q` | string | 搜索 name、description |
| `include_archived` | boolean | 是否包含归档数据，默认 false |

列表项至少返回：

```text
id, name, bot_id, cron, timezone, status,
overlap_policy, missed_run_policy,
last_run_at, last_task_id, next_run_at,
created_at, updated_at
```

<a id="get-schedule"></a>
### 查询 Schedule 详情

```http
GET /api/schedules/{schedule_id}
```

响应返回完整 `Schedule` 共享对象，并可附带：

```text
current_active_task_count
last_schedule_run
can_edit
can_trigger
can_enable
can_disable
```

这些操作能力字段由后端根据 Schedule 状态、关联 Job Definition 状态和当前用户权限计算，不是持久化字段。

<a id="update-schedule"></a>
### 更新 / 启停 Schedule

```http
PATCH /api/schedules/{schedule_id}
POST  /api/schedules/{schedule_id}/enable
POST  /api/schedules/{schedule_id}/disable
```

允许 PATCH 的字段：

```text
name
description
bot_version_id
cron
timezone
input_source
input_file_id
input_params
config
requirements
overlap_policy
missed_run_policy
jitter_seconds
max_parallel_runs
```

规则：

```text
修改 cron/timezone 后必须重新计算 next_run_at
禁用 Schedule 不影响已经创建的 Task
归档 Schedule 后不再触发，但历史 ScheduleRun 保留
```

<a id="trigger-schedule"></a>
### 手动触发 Schedule

```http
POST /api/schedules/{schedule_id}/trigger
```

手动触发表示立即按 Schedule 配置创建一次 Task，但 Schedule 本身的 cron 规则不变。

请求字段：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `reason` | string | 否 | `manual_trigger` | 触发原因 |
| `override_input_params` | object | 否 | `null` | 本次触发覆盖 input_params |
| `override_config` | object | 否 | `null` | 本次触发覆盖 config |

响应应返回本次 ScheduleRun 和新 Task：

```json
{
  "data": {
    "schedule_run": {
      "id": "schrun_xxx",
      "status": "task_created",
      "reason": "manual_trigger"
    },
    "task": {
      "id": "task_xxx",
      "status": "pending"
    }
  }
}
```

<a id="schedule-run-api"></a>
### ScheduleRun 接口与共享返回对象

```http
GET /api/schedules/{schedule_id}/runs
GET /api/schedule-runs/{run_id}
```

以上两个接口分别返回 ScheduleRun 列表和单个 ScheduleRun 详情。两者共用下面的 ScheduleRun 对象字段定义。

ScheduleRun 记录每一次“触发决策”，不只记录成功创建 Task 的情况。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | ScheduleRun ID |
| `schedule_id` | string | 是 | 所属 Schedule |
| `bot_id` | string | 是 | 冗余 Job Definition ID |
| `planned_at` | string | 是 | cron 按时区计算出的理论触发时间，也称 nominal time |
| `scheduled_at` | string | 是 | 应用随机延迟后的实际计划执行时间 |
| `jitter_seconds` | integer | 是 | 本次 ScheduleRun 使用的随机延迟上限快照 |
| `jitter_applied_seconds` | integer | 是 | 本次实际应用的随机延迟秒数 |
| `triggered_at` | string | 是 | 实际做出触发决策的时间 |
| `status` | string | 是 | ScheduleRunStatus |
| `reason` | string | 否 | skipped/failed 的原因，或手动触发原因 |
| `task_id` | string | 否 | 如果创建了 Task，记录 Task ID |
| `overlap_policy` | string | 是 | 当时采用的 overlap 策略快照 |
| `missed_run_policy` | string | 是 | 当时采用的 missed 策略快照 |
| `error_code` | string | 否 | ScheduleRun 创建 Task 失败时记录的机器可读标识；与 REST/执行错误的稳定命名空间边界由 [`ALIGN-014`](待对齐问题.md#align-014) 跟踪，决策前不得直接等同于 REST `error.code` |
| `error_message` | string | 否 | 创建失败说明，必须遵守 [安全基线](安全基线.md#security-baseline) 脱敏规则 |
| `created_at` | string | 是 | 记录创建时间 |

ScheduleRunStatus：

| 值 | 含义 |
|---|---|
| `task_created` | 已创建 Task |
| `skipped` | 本轮触发被策略跳过 |
| `failed` | 本轮触发尝试失败，例如输入非法或数据库错误 |

常见 reason：

| reason | 含义 |
|---|---|
| `previous_task_running` | 上一轮 active Task 未结束，且 overlap_policy=skip |
| `bot_disabled` | Job Definition 当前不可运行 |
| `invalid_input` | Schedule 配置的输入非法 |
| `create_task_failed` | 创建 Task 失败 |
| `missed_run_skipped` | 错过触发且策略选择跳过 |
| `max_parallel_runs_reached` | 达到并行上限 |
| `manual_trigger` | 用户手动触发 |

`ScheduleRun.reason` 是本资源的触发决策原因命名空间，例如小写 `invalid_input`；它不自动等同于 REST `error.code=INVALID_INPUT`。`reason` / `error_code` 的稳定注册边界由 [`ALIGN-014`](待对齐问题.md#align-014) 跟踪；完成决策后必须先更新 [错误标识注册表](错误标识注册表.md#error-registry)，再形成跨客户端依赖。

---

<a id="persistence-map"></a>
## 持久化映射说明

> [持久化投影]
> 本节仅记录 `schedules` 和 `schedule_runs` 对 Schedule / ScheduleRun API 与触发决策的持久化投影，不反向定义触发策略或 Task 状态。

API 中的 `bot_version_id`、`input_file_id`、`planned_at`、jitter 快照和错误字段尚未完整映射到当前表字段清单，见 [`ALIGN-002`：Schedule / ScheduleRun 字段映射](待对齐问题.md#align-002)。在该 issue 关闭前，本持久化投影不擅自新增字段、快照边界、索引或错误存储契约。

### schedules（持久化投影）

字段：

```text
id
name
description
bot_id
cron
timezone
input_source
input_params
config
requirements
overlap_policy
missed_run_policy
max_parallel_runs
status
last_run_at
next_run_at
created_by
created_at
updated_at
archived_at
```

索引：

```text
index(bot_id)
index(status, next_run_at)
index(created_by)
index(created_at)
```

---

### schedule_runs（持久化投影）

字段：

```text
id
schedule_id
task_id
scheduled_at
triggered_at
status
reason
overlap_policy
missed_run_policy
created_at
updated_at
```

索引：

```text
index(schedule_id, scheduled_at)
index(schedule_id, status)
index(task_id)
index(created_at)
```

