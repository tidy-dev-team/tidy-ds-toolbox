import React, { useEffect, useMemo, useRef, useState } from "react";
import { SearchableFeature, getSearchIndex } from "../shared/searchIndex";
import { fuzzyMatch, highlightMatches } from "../shared/fuzzySearch";

interface SearchResult extends SearchableFeature {
  score: number;
  matchedField: "label" | "keyword" | "plugin";
  matchedKeyword?: string; // The keyword that matched (if matchedField is "keyword")
}

interface SearchDropdownProps {
  query: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (feature: SearchableFeature) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

export const SearchDropdown: React.FC<SearchDropdownProps> = ({
  query,
  isOpen,
  onClose,
  onSelect,
  inputRef,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Compute search results directly from query (no state accumulation)
  const results = useMemo((): SearchResult[] => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    // Get search index dynamically to avoid initialization issues
    const searchIndex = getSearchIndex();
    const searchResults: SearchResult[] = [];

    for (const feature of searchIndex) {
      // Match against label
      const labelMatch = fuzzyMatch(trimmedQuery, feature.label);

      // Match against keywords - track best keyword
      let keywordScore = 0;
      let bestKeyword = "";
      for (const keyword of feature.keywords) {
        const match = fuzzyMatch(trimmedQuery, keyword);
        if (match && match.score > keywordScore) {
          keywordScore = match.score;
          bestKeyword = keyword;
        }
      }

      // Match against plugin label (for cross-plugin search)
      const pluginMatch = fuzzyMatch(trimmedQuery, feature.pluginLabel);

      // Determine best match and which field matched
      const labelScore = labelMatch?.score ?? 0;
      const pluginScore = pluginMatch?.score ?? 0;
      const bestScore = Math.max(labelScore, keywordScore, pluginScore);

      if (bestScore > 0) {
        let matchedField: "label" | "keyword" | "plugin";
        if (labelScore >= keywordScore && labelScore >= pluginScore) {
          matchedField = "label";
        } else if (keywordScore >= pluginScore) {
          matchedField = "keyword";
        } else {
          matchedField = "plugin";
        }

        searchResults.push({
          ...feature,
          score: bestScore,
          matchedField,
          matchedKeyword: matchedField === "keyword" ? bestKeyword : undefined,
        });
      }
    }

    // Sort by score descending, then by label
    searchResults.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.label.localeCompare(b.label);
    });

    return searchResults.slice(0, 10);
  }, [query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            onSelect(results[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, inputRef]);

  if (!isOpen || results.length === 0) return null;

  return (
    <div className="search-dropdown" ref={dropdownRef}>
      <ul className="search-dropdown__list">
        {results.map((result, index) => (
          <li key={result.id} className="search-dropdown__item">
            <button
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className={`search-dropdown__button ${index === selectedIndex ? "search-dropdown__button--selected" : ""}`}
              onClick={() => onSelect(result)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="search-dropdown__content">
                <span className="search-dropdown__label">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: highlightMatches(result.label, query),
                    }}
                  />
                </span>
                {result.matchedField === "keyword" && result.matchedKeyword && (
                  <span className="search-dropdown__matched-keyword">
                    matches "
                    <span
                      dangerouslySetInnerHTML={{
                        __html: highlightMatches(result.matchedKeyword, query),
                      }}
                    />
                    "
                  </span>
                )}
              </div>
              <div className="search-dropdown__meta">
                {result.id !== result.pluginId && (
                  <span className="search-dropdown__plugin">
                    in {result.pluginLabel}
                  </span>
                )}
                {result.section && (
                  <span className="search-dropdown__badge">Feature</span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SearchDropdown;
