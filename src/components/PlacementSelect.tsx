import { useI18n } from '../i18n';
import { useDB } from '../hooks';
import type { Placement, PlacementMode } from '../store/api';

/** UI token encoding for a single placement select. */
export type PlacementToken = 'auto' | `pool:${string}` | `worker:${string}` | '';

export function placementToToken(row: { target_pool_id?: string | null; target_worker_id?: string | null }): PlacementToken {
  if (row.target_worker_id) return `worker:${row.target_worker_id}`;
  if (row.target_pool_id) return `pool:${row.target_pool_id}`;
  return 'auto';
}

export function tokenToPlacement(token: string): { target_pool_id: string | null; target_worker_id: string | null } | null {
  if (!token || token === '') return null; // not chosen yet (required UX)
  if (token === 'auto' || token === 'random') {
    return { target_pool_id: null, target_worker_id: null };
  }
  if (token.startsWith('pool:')) {
    return { target_pool_id: token.slice(5), target_worker_id: null };
  }
  if (token.startsWith('worker:')) {
    return { target_pool_id: null, target_worker_id: token.slice(7) };
  }
  // Legacy bare worker id
  return { target_pool_id: null, target_worker_id: token };
}

export function formatPlacementLabel(
  row: { target_pool_id?: string | null; target_worker_id?: string | null },
  opts: {
    workers: { id: string; name: string }[];
    pools: { id: string; name: string }[];
    autoLabel: string;
  },
): string {
  if (row.target_worker_id) {
    return opts.workers.find((w) => w.id === row.target_worker_id)?.name ?? row.target_worker_id;
  }
  if (row.target_pool_id) {
    return opts.pools.find((p) => p.id === row.target_pool_id)?.name ?? row.target_pool_id;
  }
  return opts.autoLabel;
}

interface PlacementSelectProps {
  id?: string;
  value: string;
  onChange: (token: string) => void;
  disabled?: boolean;
  /** When true, include an empty "pick" option (required before Run). */
  requireChoice?: boolean;
  'aria-label'?: string;
}

/** Shared placement control: Auto dispatch | Worker pool | Worker node. */
export function PlacementSelect({
  id,
  value,
  onChange,
  disabled,
  requireChoice = false,
  'aria-label': ariaLabel,
}: PlacementSelectProps) {
  const { t } = useI18n();
  const db = useDB();
  const pools = db.workerPools.filter((pool) => pool.status !== 'archived');

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel ?? t('place.label')}
    >
      {requireChoice && <option value="">{t('place.pick')}</option>}
      <option value="auto">{t('place.auto')}</option>
      {pools.length > 0 && (
        <optgroup label={t('place.group.pools')}>
          {pools.map((pool) => (
            <option key={pool.id} value={`pool:${pool.id}`}>
              {pool.name} // {pool.worker_ids.length} // {pool.status}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={t('place.group.workers')}>
        {db.workers.map((worker) => (
          <option key={worker.id} value={`worker:${worker.id}`}>
            {worker.name} // {worker.status} // {worker.capacity_used}/{worker.capacity_max}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function modeOfToken(token: string): PlacementMode | null {
  if (!token) return null;
  if (token === 'auto' || token === 'random') return 'auto';
  if (token.startsWith('pool:')) return 'pool';
  if (token.startsWith('worker:')) return 'worker';
  return 'worker';
}

export type { Placement };
