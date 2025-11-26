import React from 'react'
import { ShellProvider, useShell } from './ShellContext'
import './App.css'

function Navigation() {
  const { state, dispatch } = useShell()
  const { moduleRegistry } = require('./moduleRegistry')

  const modules = Object.values(moduleRegistry)

  return (
    <nav>
      {modules.map(module => (
        <button
          key={module.id}
          className={`nav-item ${state.activeModule === module.id ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_ACTIVE_MODULE', payload: module.id })}
        >
          <span className="icon">{module.icon}</span>
          <span className="label">{module.label}</span>
        </button>
      ))}
    </nav>
  )
}

function Viewport() {
  const { state } = useShell()
  const { moduleRegistry } = require('./moduleRegistry')

  const ActiveModule = moduleRegistry[state.activeModule]?.ui || (() => <div>Module not found</div>)

  return (
    <div className="viewport-content">
      <ActiveModule />
    </div>
  )
}

function AppContent() {
  return (
    <div className="app">
      <header className="header">
        <h1>Tidy DS Toolbox</h1>
      </header>
      <div className="main">
        <aside className="sidebar">
          <Navigation />
        </aside>
        <main className="viewport">
          <Viewport />
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <ShellProvider>
      <AppContent />
    </ShellProvider>
  )
}

export default App