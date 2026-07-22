import type { ReactNode } from 'react';

export function PageHeader({ tag, title, lede }: { tag: string; title: ReactNode; lede: string }) {
  return (
    <header>
      <div className="page-tag">{tag}</div>
      <h1 className="page-title">{title}</h1>
      <p className="page-lede">{lede}</p>
    </header>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="sec-title">{title}</h2>
      {children}
    </section>
  );
}

export function Panel({ title, glow, children }: { title?: string; glow?: boolean; children: ReactNode }) {
  return (
    <div className={`panel${glow ? ' glow' : ''}`}>
      {title && <div className="panel-title">{title}</div>}
      {children}
    </div>
  );
}

export function Code({ children }: { children: string }) {
  return <pre className="codeblock">{children}</pre>;
}

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const methodClass: Record<Method, string> = {
  GET: 'ep-get',
  POST: 'ep-post',
  PATCH: 'ep-patch',
  DELETE: 'ep-delete',
};

export function EndpointTable({
  rows,
  headers,
}: {
  rows: Array<[Method, string, string]>;
  headers: [string, string, string];
}) {
  return (
    <table className="spec">
      <thead>
        <tr>
          <th>{headers[0]}</th>
          <th>{headers[1]}</th>
          <th>{headers[2]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([m, path, desc]) => (
          <tr key={`${m}-${path}`}>
            <td>
              <span className={`ep-method ${methodClass[m]}`}>{m}</span>
            </td>
            <td>{path}</td>
            <td>{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StateMachine({
  nodes,
  terminal,
}: {
  nodes: string[];
  terminal?: string[];
}) {
  const tset = new Set(terminal ?? []);
  return (
    <div className="sm-wrap">
      {nodes.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          {i > 0 && <span className="sm-arrow">──▶</span>}
          <span className={`sm-node${i === 0 ? ' start' : ''}${tset.has(n) ? ' terminal' : ''}`}>
            {n}
          </span>
        </span>
      ))}
    </div>
  );
}

export function StateChips({ states, variant }: { states: string[]; variant?: string }) {
  return (
    <div>
      {states.map((s) => (
        <span key={s} className={`chip ${variant ?? 'neon'}`}>
          {s}
        </span>
      ))}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="note-bar">{children}</div>;
}
