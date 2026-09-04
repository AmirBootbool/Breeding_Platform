
export const PLOT_COLORS: [string, string][] = [
  ['#1e4620', '#4ade80'],
  ['#1e3a5f', '#60a5fa'],
  ['#4a1942', '#e879f9'],
  ['#3b2a00', '#fbbf24'],
  ['#1a3040', '#38bdf8'],
  ['#3d1515', '#f87171'],
  ['#1f3d3d', '#34d399'],
  ['#2d2a00', '#facc15'],
]

export function colorForIndex(i: number): [string, string] {
  return PLOT_COLORS[i % PLOT_COLORS.length]
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    planned: 'badge-gray',
    planted: 'badge-amber',
    growing: 'badge-green',
    harvested: 'badge-blue',
  }
  return <span className={`badge ${map[status] ?? 'badge-gray'}`}>{status}</span>
}

export const DESIGN_TYPES = [
  'RCBD',
  'alpha_lattice',
  'augmented',
  'prep',
  'latin_square',
  'augmented_block',
  'unreplicated',
  'other',
]

export const DESIGN_TYPE_LABELS: Record<string, string> = {
  RCBD: 'Randomized Complete Block (RCBD)',
  alpha_lattice: 'Alpha-Lattice',
  augmented: 'Augmented',
  prep: 'P-Rep (Partially Replicated)',
  latin_square: 'Latin Square',
  augmented_block: 'Augmented Block',
  unreplicated: 'Unreplicated',
  other: 'Other',
}

export function DesignBadge({ type }: { type: string }) {
  return <span className="badge badge-blue">{DESIGN_TYPE_LABELS[type] || type}</span>
}
