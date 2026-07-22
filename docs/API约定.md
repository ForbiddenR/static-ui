# Bot 自动化任务平台 V1：REST 通用约定

> [本文件角色]
> 本文件只定义跨资源 REST API 的传输格式、成功响应、分页、过滤和大文件入口。资源字段由对应主题文档负责；失败响应结构、HTTP 映射和全部 `error.code` 由 [错误标识注册表](错误标识注册表.md#error-registry) 唯一定义；敏感字段及脱敏规则由 [安全基线](安全基线.md#sensitive-field-registry) 唯一定义。
> 共享规则和总体导航见 [docs/文档目录.md](文档目录.md#document-guide)。

## 快速导航

[REST 约定](#rest-conventions) · [失败响应权威](#error-response-authority) · [分页与过滤](#pagination-filtering) · [Source File](./源文件.md#source-file-api)

<a id="rest-conventions"></a>
## REST 通用约定

### API 基本约定

| 项 | 约定 |
|---|---|
| 协议 | HTTP + JSON |
| 鉴权 | Bearer Token / Session，具体实现可沿用现有用户体系；凭据边界见 [安全基线](安全基线.md#token-boundary) |
| 时间格式 | RFC3339 字符串，例如 `2026-07-14T10:30:00Z` |
| ID 类型 | 对外统一按 string 处理，例如 `bot_xxx`、`task_xxx`、`item_xxx`、`file_xxx`；内部数据库可以自行选择 bigint 或 uuid |
| JSON 字段命名 | snake_case |
| 空值 | 不存在或无值用 `null`，不要用空字符串表达未设置 |
| 大文件上传 | 统一走 [Source File API](./源文件.md#source-file-api)；使用 `multipart/form-data`；普通 JSON API 不直接传大文件内容 |
| 敏感字段 | 不在本文件重复列举；字段识别和处理以 [敏感字段注册表](安全基线.md#sensitive-field-registry) 为准 |

成功响应建议统一包一层：

```json
{
  "data": {},
  "request_id": "req_xxx"
}
```

列表响应：

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 100
  },
  "request_id": "req_xxx"
}
```

<a id="error-response-authority"></a>
### 失败响应与错误归属

所有失败 REST 响应必须遵循 [错误标识注册表](错误标识注册表.md#error-registry)。该注册表唯一负责：

```text
error / request_id 失败响应结构
HTTP 状态码与默认 error.code 映射
通用及资源专属 REST error.code 的登记与稳定语义
执行错误码、诊断码、事件原因和协议枚举的命名空间边界
```

主题文档可以说明某个业务条件何时触发已登记错误，但不得自行创建未登记的 `error.code` 或改变其 HTTP 映射。本文件不复制错误包示例和错误码表，以避免形成第二套错误契约。

<a id="pagination-filtering"></a>
## 分页与过滤

### 通用分页与过滤字段

列表接口统一支持：

| Query 字段 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---:|---|---|
| `page` | integer | 否 | `1` | 页码，从 1 开始 |
| `page_size` | integer | 否 | `20` | 每页数量，建议最大 `100` |
| `sort` | string | 否 | `-created_at` | 排序字段，前缀 `-` 表示倒序 |
| `created_from` | string | 否 | `null` | 创建时间起始，RFC3339 |
| `created_to` | string | 否 | `null` | 创建时间结束，RFC3339 |
| `q` | string | 否 | `null` | 模糊搜索关键字，具体匹配字段由资源决定 |

---
