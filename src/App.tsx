import React from "react";
import { ShellProvider, useShell } from "./ShellContext";
import { ErrorBoundary, ResizeHandle } from "./components";
import { moduleRegistry } from "./moduleRegistry";
import "./App.css";

function Navigation() {
  const { state, dispatch } = useShell();
  const modules = Object.values(moduleRegistry) as any[];

  return (
    <nav>
      {modules.map((module) => {
        const IconComponent = module.icon;
        return (
          <button
            key={module.id}
            className={`nav-item ${state.activeModule === module.id ? "active" : ""}`}
            onClick={() =>
              dispatch({ type: "SET_ACTIVE_MODULE", payload: module.id })
            }
          >
            <span className="icon">
              {typeof IconComponent === "string" ? (
                IconComponent
              ) : (
                <IconComponent size={20} stroke={1.5} />
              )}
            </span>
            <span className="label">{module.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Viewport() {
  const { state } = useShell();

  const ActiveModule =
    moduleRegistry[state.activeModule]?.ui ||
    (() => <div>Module not found</div>);

  return (
    <div className="viewport-content">
      <ActiveModule />
    </div>
  );
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
          <ResizeHandle />
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ShellProvider>
        <AppContent />
      </ShellProvider>
    </ErrorBoundary>
  );
}

export default App;
