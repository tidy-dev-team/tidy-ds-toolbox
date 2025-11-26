import React from 'react'
import { ModuleRegistry, ModuleManifest } from '@shared/types'
import { ShapeShifterUI } from './plugins/shape-shifter/ui'

// Placeholder components for modules
const DashboardComponent = () => React.createElement('div', null, 'Dashboard Module')
const TextMasterComponent = () => React.createElement('div', null, 'Text Master Module')
const ColorLabComponent = () => React.createElement('div', null, 'Color Lab - Coming Soon')

// Module handlers (will be implemented)
const dashboardHandler = async (action: string, payload: any, figma: any) => {
  // Dashboard logic
}

const shapeShifterHandler = async (action: string, payload: any, figma: any) => {
  // Shape shifter logic
}

const textMasterHandler = async (action: string, payload: any, figma: any) => {
  // Text master logic
}

const colorLabHandler = async (action: string, payload: any, figma: any) => {
  // Color lab logic
}

export const moduleRegistry: ModuleRegistry = {
  dashboard: {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '🏠',
    ui: DashboardComponent,
    handler: dashboardHandler,
    permissionRequirements: [],
  },
  'shape-shifter': {
    id: 'shape-shifter',
    label: 'Shape Shifter',
    icon: '🔄',
    ui: ShapeShifterComponent,
    handler: shapeShifterHandler,
    permissionRequirements: ['activeselection'],
  },
  'text-master': {
    id: 'text-master',
    label: 'Text Master',
    icon: '📝',
    ui: TextMasterComponent,
    handler: textMasterHandler,
    permissionRequirements: ['activeselection'],
  },
  'color-lab': {
    id: 'color-lab',
    label: 'Color Lab',
    icon: '🎨',
    ui: ColorLabComponent,
    handler: colorLabHandler,
    permissionRequirements: ['activeselection'],
  },
}