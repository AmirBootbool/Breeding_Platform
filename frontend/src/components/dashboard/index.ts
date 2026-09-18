import React from 'react'
import StatStripWidget from './StatStripWidget'
import GenerationPipelineWidget from './GenerationPipelineWidget'
import PendingObservationsWidget from './PendingObservationsWidget'
import ActiveTrialsWidget from './ActiveTrialsWidget'
import LowStockWidget from './LowStockWidget'
import RecentCrossesWidget from './RecentCrossesWidget'
import RecentObservationsWidget from './RecentObservationsWidget'
import BreedingProgramsWidget from './BreedingProgramsWidget'
import QuickActionsWidget from './QuickActionsWidget'

export interface WidgetDefinition {
  id: string
  label: string
  description: string
  component: React.ComponentType
}

export const WIDGET_REGISTRY: Record<string, WidgetDefinition> = {
  StatStripWidget: {
    id: 'StatStripWidget',
    label: 'Key Metric Counters',
    description: 'Overview numbers of programs, accessions, trials, and observations',
    component: StatStripWidget,
  },
  PendingObservationsWidget: {
    id: 'PendingObservationsWidget',
    label: 'Actionable Alerts & Tasks',
    description: 'High-priority actions including low seed stock and active crossing blocks',
    component: PendingObservationsWidget,
  },
  GenerationPipelineWidget: {
    id: 'GenerationPipelineWidget',
    label: 'Breeding Pipeline Chart',
    description: 'Active trials grouped by breeding generation (F1–F8+)',
    component: GenerationPipelineWidget,
  },
  ActiveTrialsWidget: {
    id: 'ActiveTrialsWidget',
    label: 'Active Field Trials',
    description: 'Summary grid of current ongoing field experiments',
    component: ActiveTrialsWidget,
  },
  LowStockWidget: {
    id: 'LowStockWidget',
    label: 'Low Seed Stock Alerts',
    description: 'List of seed vault packets below 50g balance',
    component: LowStockWidget,
  },
  RecentCrossesWidget: {
    id: 'RecentCrossesWidget',
    label: 'Active Crossing Blocks',
    description: 'Recent crossing plans and cross counts',
    component: RecentCrossesWidget,
  },
  RecentObservationsWidget: {
    id: 'RecentObservationsWidget',
    label: 'Recent Field Observations',
    description: 'Live feed of recently collected plot observation data',
    component: RecentObservationsWidget,
  },
  BreedingProgramsWidget: {
    id: 'BreedingProgramsWidget',
    label: 'Breeding Programs',
    description: 'Program descriptions and crop focuses',
    component: BreedingProgramsWidget,
  },
  QuickActionsWidget: {
    id: 'QuickActionsWidget',
    label: 'Quick Operations',
    description: 'Fast shortcut buttons to common breeding workflows',
    component: QuickActionsWidget,
  },
}

export const ROLE_DEFAULTS: Record<string, string[]> = {
  technician: [
    'PendingObservationsWidget',
    'LowStockWidget',
    'RecentObservationsWidget',
    'QuickActionsWidget',
  ],
  breeder: [
    'StatStripWidget',
    'PendingObservationsWidget',
    'GenerationPipelineWidget',
    'RecentCrossesWidget',
    'ActiveTrialsWidget',
    'QuickActionsWidget',
  ],
  admin: [
    'StatStripWidget',
    'PendingObservationsWidget',
    'GenerationPipelineWidget',
    'ActiveTrialsWidget',
    'LowStockWidget',
    'RecentCrossesWidget',
    'BreedingProgramsWidget',
    'RecentObservationsWidget',
    'QuickActionsWidget',
  ],
  viewer: [
    'StatStripWidget',
    'ActiveTrialsWidget',
    'RecentObservationsWidget',
    'BreedingProgramsWidget',
  ],
}
