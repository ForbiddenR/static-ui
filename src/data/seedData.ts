import type { PlatformSeedState, TaskStatistics } from '../domain/types'

export const DEMO_NOW = '2026-07-15T10:48:00+08:00'

export const trendByPeriod = {
  today: [42, 58, 45, 72, 66, 84, 78, 96, 88, 109, 102, 118],
  week: [78, 92, 86, 108, 98, 116, 112, 128, 122, 136, 132, 148],
  month: [66, 74, 82, 78, 94, 102, 98, 116, 108, 124, 132, 142],
}

const statistics = (total: number, completed: number, success: number, failed = 0, timeout = 0): TaskStatistics => ({
  total_items: total,
  completed_items: completed,
  pending_items: Math.max(total - completed, 0),
  running_items: total > completed ? 1 : 0,
  success_items: success,
  failed_items: failed,
  skipped_items: 0,
  canceled_items: 0,
  timeout_items: timeout,
  progress_rate: total ? Math.round((completed / total) * 100) : 0,
  success_rate: completed ? Number(((success / completed) * 100).toFixed(1)) : 0,
  error_rate: completed ? Number((((failed + timeout) / completed) * 100).toFixed(1)) : 0,
  total_results: success,
  artifact_count: Math.ceil(success / 320),
  log_count: Math.max(completed * 2, 1),
  error_log_count: failed + timeout,
})

export const initialPlatformState: PlatformSeedState = {
  sequence: 400,
  demoNow: DEMO_NOW,
  bots: [
    { id: 'bot-approval', code: 'oem_approval', name: '主机厂审批提交 Bot', description: '批量提交主机厂审批资料并回收审批状态。', category: '流程自动化', tags: ['审批', '批量处理'], status: 'enabled', entrypoint: 'main.py', current_version_id: 'bv-approval-3', default_input_source: 'file', default_config: { concurrency: 4 }, default_requirements: { runtime: 'python3.11', labels: ['cn-east'] }, created_by: '陈默', updated_at: '2026-07-12 16:20' },
    { id: 'bot-inventory', code: 'inventory_sync', name: '库存同步 Bot', description: '同步经销商库存与库存预警数据。', category: '数据同步', tags: ['库存', '同步'], status: 'enabled', entrypoint: 'sync.py', current_version_id: 'bv-inventory-2', default_input_source: 'params', default_config: { batch_size: 500 }, default_requirements: { runtime: 'python3.11', labels: ['cn-north'] }, created_by: '林晴', updated_at: '2026-07-14 09:30' },
    { id: 'bot-notice', code: 'notice_crawler', name: '公告数据爬取 Bot', description: '增量采集公告信息并生成结构化结果。', category: '数据采集', tags: ['公告', '采集'], status: 'enabled', entrypoint: 'crawler.py', current_version_id: 'bv-notice-5', default_input_source: 'params', default_config: { pages: 20 }, default_requirements: { runtime: 'python3.11', capabilities: ['browser'] }, created_by: '唐越', updated_at: '2026-07-15 08:15' },
    { id: 'bot-price', code: 'price_monitor', name: '价格监控 Bot', description: '跟踪售后价格异常并形成日报。', category: '监控预警', tags: ['价格', '预警'], status: 'disabled', entrypoint: 'monitor.py', current_version_id: 'bv-price-2', default_input_source: 'params', default_config: { threshold: 0.08 }, default_requirements: { runtime: 'python3.11', capabilities: ['browser'] }, created_by: '周航', updated_at: '2026-07-15 09:20' },
  ],
  botVersions: [
    { id: 'bv-approval-3', bot_id: 'bot-approval', version: 'v1.3.0', source_file: 'approval-bot-v1.3.zip', entrypoint: 'main.py', change_note: '优化失败明细回传与批次重试。', created_by: '陈默', created_at: '2026-07-12 16:20' },
    { id: 'bv-approval-2', bot_id: 'bot-approval', version: 'v1.2.0', source_file: 'approval-bot-v1.2.zip', entrypoint: 'main.py', change_note: '新增审批状态查询。', created_by: '陈默', created_at: '2026-06-28 11:05' },
    { id: 'bv-inventory-2', bot_id: 'bot-inventory', version: 'v2.1.0', source_file: 'inventory-sync-v2.1.zip', entrypoint: 'sync.py', change_note: '增加库存差异校验。', created_by: '林晴', created_at: '2026-07-14 09:30' },
    { id: 'bv-notice-5', bot_id: 'bot-notice', version: 'v1.8.2', source_file: 'notice-crawler-v1.8.2.zip', entrypoint: 'crawler.py', change_note: '修复分页边界与附件识别。', created_by: '唐越', created_at: '2026-07-15 08:15' },
    { id: 'bv-price-2', bot_id: 'bot-price', version: 'v1.4.1', source_file: 'price-monitor-v1.4.1.zip', entrypoint: 'monitor.py', change_note: '更新登录流程；凭证需重新配置。', created_by: '周航', created_at: '2026-07-10 13:40' },
  ],
  tasks: [
    { id: 'TASK-0715-0342', name: '华东区审批资料批量提交', bot_id: 'bot-approval', bot_version_id: 'bv-approval-3', bot_snapshot: { name: '主机厂审批提交 Bot', version: 'v1.3.0', entrypoint: 'main.py' }, status: 'running', run_type: 'manual', priority: 'normal', worker_id: 'worker-sh-03', owner: '业务运营组', input_source: 'file', input_summary: 'approval-east-0715.xlsx · 800 条', created_at: '2026-07-15 10:40', started_at: '2026-07-15 10:42', finished_at: null, source_task_id: null, schedule_id: null, schedule_run_id: null, error_code: null, error_message: null, statistics: statistics(800, 624, 618, 6) },
    { id: 'TASK-0715-0338', name: '经销商库存数据同步', bot_id: 'bot-inventory', bot_version_id: 'bv-inventory-2', bot_snapshot: { name: '库存同步 Bot', version: 'v2.1.0', entrypoint: 'sync.py' }, status: 'success', run_type: 'schedule', priority: 'normal', worker_id: 'worker-bj-01', owner: '数据管理组', input_source: 'params', input_summary: 'business_date=2026-07-15', created_at: '2026-07-15 10:16', started_at: '2026-07-15 10:18', finished_at: '2026-07-15 10:27', source_task_id: null, schedule_id: 'schedule-inventory', schedule_run_id: 'sr-inventory-0715', error_code: null, error_message: null, statistics: statistics(1286, 1286, 1286) },
    { id: 'TASK-0715-0331', name: '公告信息增量采集', bot_id: 'bot-notice', bot_version_id: 'bv-notice-5', bot_snapshot: { name: '公告数据爬取 Bot', version: 'v1.8.2', entrypoint: 'crawler.py' }, status: 'partial_success', run_type: 'schedule', priority: 'normal', worker_id: 'worker-gz-02', owner: '市场研究部', input_source: 'params', input_summary: 'source=all · mode=incremental', created_at: '2026-07-15 09:34', started_at: '2026-07-15 09:36', finished_at: '2026-07-15 10:03', source_task_id: null, schedule_id: 'schedule-notice', schedule_run_id: 'sr-notice-0715', error_code: 'ITEM_ERRORS', error_message: '13 条公告附件解析失败', statistics: statistics(960, 960, 947, 13) },
    { id: 'TASK-0715-0329', name: '售后价格监控日报', bot_id: 'bot-price', bot_version_id: 'bv-price-2', bot_snapshot: { name: '价格监控 Bot', version: 'v1.4.1', entrypoint: 'monitor.py' }, status: 'failed', run_type: 'manual', priority: 'high', worker_id: 'worker-sh-02', owner: '售后管理部', input_source: 'params', input_summary: 'region=all · report=daily', created_at: '2026-07-15 09:10', started_at: '2026-07-15 09:12', finished_at: '2026-07-15 09:18', source_task_id: null, schedule_id: null, schedule_run_id: null, error_code: 'AUTH_EXPIRED', error_message: '数据源登录状态已失效', statistics: statistics(600, 216, 212, 4) },
    { id: 'TASK-0715-0324', name: '历史合同附件归档', bot_id: 'bot-approval', bot_version_id: 'bv-approval-3', bot_snapshot: { name: '主机厂审批提交 Bot', version: 'v1.3.0', entrypoint: 'main.py' }, status: 'pending', run_type: 'manual', priority: 'low', worker_id: null, owner: '流程与合规部', input_source: 'file', input_summary: 'contracts-archive.csv · 428 条', created_at: '2026-07-15 08:48', started_at: null, finished_at: null, source_task_id: null, schedule_id: null, schedule_run_id: null, error_code: null, error_message: null, statistics: statistics(428, 0, 0) },
  ],
  taskItems: [
    { id: 'ITEM-0342-001', task_id: 'TASK-0715-0342', type: 'record', key: 'VIN-LS6A-0001', index: 1, status: 'success', summary: '审批资料提交完成', duration_ms: 1820, result_count: 1, artifact_count: 0, log_count: 3, error_message: null, input_data: '车型、经销商、附件 4 项', output_data: '受理号 AP-873240' },
    { id: 'ITEM-0342-002', task_id: 'TASK-0715-0342', type: 'record', key: 'VIN-LS6A-0002', index: 2, status: 'running', summary: '正在上传证明附件', duration_ms: null, result_count: 0, artifact_count: 0, log_count: 2, error_message: null, input_data: '车型、经销商、附件 3 项', output_data: null },
    { id: 'ITEM-0342-003', task_id: 'TASK-0715-0342', type: 'record', key: 'VIN-LS6A-0003', index: 3, status: 'failed', summary: '附件格式校验失败', duration_ms: 940, result_count: 0, artifact_count: 1, log_count: 4, error_message: 'PDF 文件损坏，无法读取' , input_data: '车型、经销商、附件 5 项', output_data: null },
    { id: 'ITEM-0331-947', task_id: 'TASK-0715-0331', type: 'url', key: 'NOTICE-20260715-947', index: 947, status: 'success', summary: '公告正文与附件已入库', duration_ms: 3280, result_count: 1, artifact_count: 1, log_count: 5, error_message: null, input_data: 'https://example.cn/notice/947', output_data: '正文 3,842 字' },
    { id: 'ITEM-0331-954', task_id: 'TASK-0715-0331', type: 'file', key: 'NOTICE-20260715-954', index: 954, status: 'failed', summary: '附件解析失败', duration_ms: 2410, result_count: 0, artifact_count: 1, log_count: 5, error_message: '扫描件清晰度不足', input_data: 'notice-954.pdf', output_data: null },
    { id: 'ITEM-0329-216', task_id: 'TASK-0715-0329', type: 'page', key: 'PRICE-SOURCE-07', index: 216, status: 'failed', summary: '登录状态失效', duration_ms: 850, result_count: 0, artifact_count: 1, log_count: 6, error_message: 'AUTH_EXPIRED', input_data: '华南售后价格源', output_data: null },
  ],
  logs: [
    { id: 'LOG-342-01', task_id: 'TASK-0715-0342', task_item_id: null, level: 'info', source: 'runtime', seq: 1, message: 'Python 运行环境已准备完成', created_at: '10:42:04' },
    { id: 'LOG-342-02', task_id: 'TASK-0715-0342', task_item_id: 'ITEM-0342-002', level: 'info', source: 'script', seq: 2, message: '正在提交第 624 / 800 条审批资料', created_at: '10:47:32' },
    { id: 'LOG-342-03', task_id: 'TASK-0715-0342', task_item_id: 'ITEM-0342-003', level: 'warning', source: 'script', seq: 3, message: '附件格式异常，已记录失败明细', created_at: '10:47:38' },
    { id: 'LOG-331-01', task_id: 'TASK-0715-0331', task_item_id: 'ITEM-0331-954', level: 'error', source: 'script', seq: 1, message: 'OCR 无法识别扫描附件', created_at: '10:02:11' },
    { id: 'LOG-329-01', task_id: 'TASK-0715-0329', task_item_id: 'ITEM-0329-216', level: 'error', source: 'script', seq: 1, message: '登录凭证已过期，请重新配置', created_at: '09:18:02' },
  ],
  taskEvents: [
    { id: 'EV-342-01', task_id: 'TASK-0715-0342', type: 'created', label: '任务已创建', at: '10:40', actor: '陈默' },
    { id: 'EV-342-02', task_id: 'TASK-0715-0342', type: 'assigned', label: '已分配 Worker', at: '10:41', actor: 'Master' },
    { id: 'EV-342-03', task_id: 'TASK-0715-0342', type: 'started', label: '脚本开始执行', at: '10:42', actor: 'worker-sh-03' },
    { id: 'EV-329-01', task_id: 'TASK-0715-0329', type: 'failed', label: '任务执行失败', at: '09:18', actor: 'worker-sh-02' },
  ],
  schedules: [
    { id: 'schedule-approval', name: '审批状态批量查询', description: '持续回收审批结果并更新业务台账。', bot_id: 'bot-approval', bot_version_id: null, cron: '*/30 9-18 * * 1-5', timezone: 'Asia/Shanghai', input_source: 'params', input_params: { mode: 'status_query' }, overlap_policy: 'skip', missed_run_policy: 'run_once', jitter_seconds: 120, status: 'enabled', last_run_at: '2026-07-15 10:30', last_task_id: 'TASK-0715-0342', next_planned_at: '2026-07-15 11:30', next_run_at: '2026-07-15 11:31', created_by: '陈默', updated_at: '2026-07-14 17:20' },
    { id: 'schedule-inventory', name: '经销商库存数据同步', description: '每日同步库存与预警指标。', bot_id: 'bot-inventory', bot_version_id: 'bv-inventory-2', cron: '0 13 * * *', timezone: 'Asia/Shanghai', input_source: 'params', input_params: { business_date: 'today' }, overlap_policy: 'skip', missed_run_policy: 'run_once', jitter_seconds: 300, status: 'enabled', last_run_at: '2026-07-15 10:16', last_task_id: 'TASK-0715-0338', next_planned_at: '2026-07-15 13:00', next_run_at: '2026-07-15 13:02', created_by: '林晴', updated_at: '2026-07-13 10:05' },
    { id: 'schedule-notice', name: '公告信息增量采集', description: '工作日下午采集公告增量。', bot_id: 'bot-notice', bot_version_id: null, cron: '30 16 * * 1-5', timezone: 'Asia/Shanghai', input_source: 'params', input_params: { mode: 'incremental' }, overlap_policy: 'skip', missed_run_policy: 'run_once', jitter_seconds: 0, status: 'enabled', last_run_at: '2026-07-15 09:34', last_task_id: 'TASK-0715-0331', next_planned_at: '2026-07-15 16:30', next_run_at: '2026-07-15 16:30', created_by: '唐越', updated_at: '2026-07-15 08:20' },
    { id: 'schedule-price', name: '售后价格监控日报', description: '每天生成价格异常日报。', bot_id: 'bot-price', bot_version_id: null, cron: '0 9 * * 1-5', timezone: 'Asia/Shanghai', input_source: 'params', input_params: { region: 'all' }, overlap_policy: 'skip', missed_run_policy: 'run_once', jitter_seconds: 0, status: 'disabled', last_run_at: '2026-07-14 09:00', last_task_id: 'TASK-0715-0329', next_planned_at: null, next_run_at: null, created_by: '周航', updated_at: '2026-07-15 09:20' },
  ],
  scheduleRuns: [
    { id: 'sr-inventory-0715', schedule_id: 'schedule-inventory', bot_id: 'bot-inventory', planned_at: '2026-07-15 10:15', scheduled_at: '2026-07-15 10:16', triggered_at: '2026-07-15 10:16', jitter_seconds: 300, jitter_applied_seconds: 62, status: 'task_created', reason: 'scheduled', task_id: 'TASK-0715-0338', overlap_policy: 'skip', missed_run_policy: 'run_once', error_message: null },
    { id: 'sr-notice-0715', schedule_id: 'schedule-notice', bot_id: 'bot-notice', planned_at: '2026-07-15 09:30', scheduled_at: '2026-07-15 09:34', triggered_at: '2026-07-15 09:34', jitter_seconds: 300, jitter_applied_seconds: 244, status: 'task_created', reason: 'missed_run_recovered', task_id: 'TASK-0715-0331', overlap_policy: 'skip', missed_run_policy: 'run_once', error_message: null },
    { id: 'sr-approval-skip', schedule_id: 'schedule-approval', bot_id: 'bot-approval', planned_at: '2026-07-15 10:30', scheduled_at: '2026-07-15 10:31', triggered_at: '2026-07-15 10:31', jitter_seconds: 120, jitter_applied_seconds: 48, status: 'skipped', reason: 'previous_task_running', task_id: null, overlap_policy: 'skip', missed_run_policy: 'run_once', error_message: null },
    { id: 'sr-price-skip', schedule_id: 'schedule-price', bot_id: 'bot-price', planned_at: '2026-07-15 09:00', scheduled_at: '2026-07-15 09:00', triggered_at: '2026-07-15 09:00', jitter_seconds: 0, jitter_applied_seconds: 0, status: 'skipped', reason: 'bot_disabled', task_id: null, overlap_policy: 'skip', missed_run_policy: 'run_once', error_message: null },
    { id: 'sr-notice-failed', schedule_id: 'schedule-notice', bot_id: 'bot-notice', planned_at: '2026-07-14 16:30', scheduled_at: '2026-07-14 16:30', triggered_at: '2026-07-14 16:30', jitter_seconds: 0, jitter_applied_seconds: 0, status: 'failed', reason: 'invalid_input', task_id: null, overlap_policy: 'skip', missed_run_policy: 'run_once', error_message: '输入参数 source 不能为空' },
  ],
  results: [
    { id: 'RES-0338-001', task_id: 'TASK-0715-0338', task_item_id: null, bot_id: 'bot-inventory', type: 'summary', key: 'inventory_sync_summary', data: { stores: 286, sku: 1286, warnings: 17 }, created_at: '2026-07-15 10:27' },
    { id: 'RES-0331-947', task_id: 'TASK-0715-0331', task_item_id: 'ITEM-0331-947', bot_id: 'bot-notice', type: 'record', key: 'NOTICE-20260715-947', data: { title: '关于零部件价格调整的公告', attachments: 2, status: 'published' }, created_at: '2026-07-15 10:02' },
    { id: 'RES-0342-001', task_id: 'TASK-0715-0342', task_item_id: 'ITEM-0342-001', bot_id: 'bot-approval', type: 'record', key: 'VIN-LS6A-0001', data: { receipt: 'AP-873240', state: 'accepted' }, created_at: '2026-07-15 10:43' },
  ],
  artifacts: [
    { id: 'ART-0331-001', task_id: 'TASK-0715-0331', task_item_id: 'ITEM-0331-947', bot_id: 'bot-notice', name: 'notice-947.pdf', type: 'download', content_type: 'application/pdf', size: 2480120, checksum: 'sha256:7c91…18af', created_at: '2026-07-15 10:02', content: '公告附件示例内容' },
    { id: 'ART-0329-001', task_id: 'TASK-0715-0329', task_item_id: 'ITEM-0329-216', bot_id: 'bot-price', name: 'auth-expired.png', type: 'screenshot', content_type: 'image/png', size: 428302, checksum: 'sha256:03ae…72ca', created_at: '2026-07-15 09:18', content: '登录状态失效截图示例' },
  ],
  workers: [
    { id: 'worker-sh-03', name: '上海执行节点 03', hostname: 'sh-worker-03.internal', status: 'online', version: '1.8.2', runtimes: ['python3.11'], capabilities: ['browser', 'office'], labels: ['cn-east', 'high-memory'], max_concurrency: 4, current_running: 2, free_slots: 2, running_tasks: ['TASK-0715-0342'], metrics: { cpu: 58, memory: 64 }, last_heartbeat_at: '2026-07-15 10:47:56' },
    { id: 'worker-bj-01', name: '北京执行节点 01', hostname: 'bj-worker-01.internal', status: 'online', version: '1.8.2', runtimes: ['python3.11'], capabilities: ['database'], labels: ['cn-north'], max_concurrency: 6, current_running: 1, free_slots: 5, running_tasks: [], metrics: { cpu: 34, memory: 48 }, last_heartbeat_at: '2026-07-15 10:47:58' },
    { id: 'worker-gz-02', name: '广州执行节点 02', hostname: 'gz-worker-02.internal', status: 'online', version: '1.8.1', runtimes: ['python3.10', 'python3.11'], capabilities: ['browser'], labels: ['cn-south'], max_concurrency: 4, current_running: 0, free_slots: 4, running_tasks: [], metrics: { cpu: 22, memory: 41 }, last_heartbeat_at: '2026-07-15 10:47:54' },
    { id: 'worker-sh-02', name: '上海执行节点 02', hostname: 'sh-worker-02.internal', status: 'offline', version: '1.8.1', runtimes: ['python3.11'], capabilities: ['browser'], labels: ['cn-east'], max_concurrency: 4, current_running: 0, free_slots: 0, running_tasks: [], metrics: { cpu: 0, memory: 0 }, last_heartbeat_at: '2026-07-15 09:19:02' },
  ],
} satisfies PlatformSeedState
