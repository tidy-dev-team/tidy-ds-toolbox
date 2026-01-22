import { ShellProvider, useShell } from "./ShellContext";
import { ErrorBoundary, ResizeHandle } from "./components";
import { SearchDropdown } from "./components/SearchDropdown";
import { SearchableFeature } from "./shared/searchIndex";
import { moduleRegistry } from "./moduleRegistry";
import { ModuleManifest } from "@shared/types";
import "./App.css";
import {
  IconLayoutSidebar,
  IconLayoutSidebarFilled,
  IconMessageCircle,
} from "@tabler/icons-react";

function Navigation() {
  const { state, dispatch } = useShell();
  const modules = Object.values(moduleRegistry).sort((a, b) =>
    b.state.localeCompare(a.state),
  );

  // Group modules by state
  const groupedModules = modules.reduce(
    (acc, module: ModuleManifest) => {
      if (!acc[module.state]) {
        acc[module.state] = [];
      }
      acc[module.state].push(module);
      return acc;
    },
    {} as Record<string, ModuleManifest[]>,
  );

  // Define order of states
  const stateOrder = ["stable", "beta", "alpha", "experimental", "deprecated"];
  const orderedStates = stateOrder.filter((state) => groupedModules[state]);

  return (
    <nav>
      {orderedStates.map((stateName) => (
        <div key={stateName} className="nav-section">
          <h3 className="nav-section-heading">{stateName}</h3>
          {groupedModules[stateName].map((module: ModuleManifest) => {
            const IconComponent = module.icon;
            return (
              <button
                key={module.id}
                aria-label={module.label}
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
        </div>
      ))}
    </nav>
  );
}

function Viewport() {
  const { state } = useShell();

  const ActiveModule =
    moduleRegistry[state.activeModule]?.ui ||
    (() => <div>Module not found</div>);

  return (
    <div className="viewport-scroll">
      <div className="viewport-content">
        <ActiveModule />
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from "react";

function AppContent() {
  const [sidebarSmall, setSidebarSmall] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { state, dispatch } = useShell();

  const handleMenuClick = () => {
    setSidebarSmall((prev) => !prev);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setIsSearchOpen(value.trim().length > 0);
  };

  const handleSearchFocus = () => {
    if (searchQuery.trim().length > 0) {
      setIsSearchOpen(true);
    }
  };

  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  const handleSearchSelect = useCallback(
    (feature: SearchableFeature) => {
      // Navigate to the feature
      dispatch({
        type: "SET_FEATURE_FOCUS",
        payload: {
          pluginId: feature.pluginId,
          section: feature.section ?? null,
        },
      });
      // Clear search
      setSearchQuery("");
      setIsSearchOpen(false);
      searchInputRef.current?.blur();
    },
    [dispatch],
  );

  const handleFeedbackClick = () => {
    parent.postMessage(
      {
        pluginMessage: {
          type: "open-external-link",
          url: "mailto:adir@wearekido.com?subject=Tidy DS Toolbox Feedback",
        },
      },
      "*",
    );
  };

  // Scroll to focused feature when it changes
  useEffect(() => {
    if (state.featureFocus) {
      // Small delay to ensure the plugin UI is rendered
      const timeout = setTimeout(() => {
        const element = document.querySelector(state.featureFocus!);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          // Add highlight effect
          element.classList.add("feature-highlight");
          setTimeout(() => element.classList.remove("feature-highlight"), 2000);
        }
        // Clear focus after scrolling
        dispatch({ type: "CLEAR_FEATURE_FOCUS" });
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [state.featureFocus, state.activeModule, dispatch]);

  return (
    <div className="app">
      <header className="header">
        <button className="menuBtn" onClick={handleMenuClick}>
          <IconLayoutSidebar className="side-icon" />
          <IconLayoutSidebarFilled className="side-filled-icon" />
        </button>
        <h1>Tidy DS Toolbox</h1>

        <div className="searchdiv">
          <input
            ref={searchInputRef}
            type="search"
            placeholder="Search features..."
            className="searchbar"
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={handleSearchFocus}
          />
          <SearchDropdown
            query={searchQuery}
            isOpen={isSearchOpen}
            onClose={handleSearchClose}
            onSelect={handleSearchSelect}
            inputRef={searchInputRef}
          />
        </div>
      </header>
      <div className="main">
        <aside className={`sidebar${sidebarSmall ? " small" : ""}`}>
          <Navigation />
          <div className="spacer"></div>
          <button
            className="nav-item"
            aria-label="Feedback"
            onClick={handleFeedbackClick}
          >
            <span className="icon">
              <IconMessageCircle size={20} stroke={1.5} />
            </span>
            <span className="label">Feedback</span>
          </button>
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
