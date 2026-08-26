import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * A text input with a suggestion list that never covers the input.
 *
 * It replaces the native `<datalist>`, which Chromium draws as a popup
 * anchored *over* the field: the typed text disappears under the first
 * suggestion, so a user editing "Button-icon" down to "Button" cannot see how
 * much is left. The list here is a plain element placed below the field, or
 * above it when the field sits too low in the viewport for the list to fit.
 *
 * Positioned `fixed` from the input's rect rather than `absolute` inside the
 * card, because every panel here scrolls and an absolute list is clipped by
 * the first ancestor that does.
 */

const MAX_SUGGESTIONS = 50;
const GAP = 4;
const MIN_LIST_HEIGHT = 96;
const MAX_LIST_HEIGHT = 220;
/** Row height plus the list's own padding, used to ask for only as much room
 *  as the list actually needs before it has been rendered and can be measured. */
const ROW_HEIGHT = 27;
const LIST_PADDING = 8;

export interface SuggestInputProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  /** Called when an option is picked from the list or typed exactly. */
  onSelect?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  style?: React.CSSProperties;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  disabled?: boolean;
}

interface ListBox {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

export const SuggestInput: React.FC<SuggestInputProps> = ({
  value,
  options,
  onChange,
  onSelect,
  onFocus,
  onBlur,
  placeholder,
  style,
  inputRef,
  disabled,
}) => {
  const ownRef = useRef<HTMLInputElement>(null);
  const inputEl = inputRef ?? ownRef;
  const listRef = useRef<HTMLUListElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [box, setBox] = useState<ListBox | null>(null);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    const hits = query
      ? options.filter((option) => option.toLowerCase().includes(query))
      : options;
    return hits.slice(0, MAX_SUGGESTIONS);
  }, [options, value]);

  const open = isOpen && matches.length > 0;

  /**
   * Below the field by default; above it only when the space below cannot hold
   * a usable list and the space above is larger. Either way the field itself
   * stays uncovered.
   */
  const measure = useCallback(
    (contentHeight?: number) => {
      const el = inputEl.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - GAP * 2;
      const above = rect.top - GAP * 2;
      // The measured list when there is one, an estimate on the first pass
      // before it has been drawn. Sizing to the content is what stops a row
      // being cut in half at the bottom edge.
      const wanted = Math.min(
        MAX_LIST_HEIGHT,
        contentHeight ?? matches.length * ROW_HEIGHT + LIST_PADDING,
      );
      // Below unless the whole list fits better above. A cramped list is fine;
      // one running off the edge of the viewport is not.
      const placeAbove = below < wanted && above > below;
      const room = Math.max(placeAbove ? above : below, MIN_LIST_HEIGHT);
      const maxHeight = Math.min(wanted, room);
      const next: ListBox = {
        left: rect.left,
        width: rect.width,
        maxHeight,
        top: placeAbove ? rect.top - GAP - maxHeight : rect.bottom + GAP,
      };
      setBox((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight
          ? prev
          : next,
      );
    },
    [inputEl, matches.length],
  );

  // No dependency list: the second pass has to happen after the list is drawn,
  // and `measure` keeps the previous box when nothing moved, so this settles.
  useLayoutEffect(() => {
    if (!open) return;
    measure(listRef.current?.scrollHeight);
  });

  useEffect(() => {
    if (!open) return;
    const onMove = () => measure(listRef.current?.scrollHeight);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (listRef.current?.contains(target)) return;
      if (inputEl.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, inputEl]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      onSelect?.(next);
      setIsOpen(false);
      setActiveIndex(-1);
      inputEl.current?.focus();
    },
    [onChange, onSelect, inputEl],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setIsOpen(false);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setIsOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((prev) => {
        const next = prev + step;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      commit(matches[activeIndex]);
    }
  };

  // Keep the highlighted row inside the scrolled list, without moving the page.
  useEffect(() => {
    if (activeIndex < 0) return;
    const list = listRef.current;
    const item = list?.children[activeIndex] as HTMLElement | undefined;
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) {
      list.scrollTop = item.offsetTop;
    } else if (
      item.offsetTop + item.offsetHeight >
      list.scrollTop + list.clientHeight
    ) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }, [activeIndex]);

  return (
    <>
      <input
        ref={inputEl}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        style={style}
        onChange={(event) => {
          onChange(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          onFocus?.();
        }}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
      />
      {open && box && (
        <ul
          ref={listRef}
          className="suggest-input__list"
          role="listbox"
          style={{
            left: `${box.left}px`,
            top: `${box.top}px`,
            width: `${box.width}px`,
            maxHeight: `${box.maxHeight}px`,
          }}
        >
          {matches.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={index === activeIndex}
              className={`suggest-input__option${
                index === activeIndex ? " suggest-input__option--active" : ""
              }`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                // Before blur, so the click is not lost to the field closing.
                event.preventDefault();
                commit(option);
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

export default SuggestInput;
