/**
 * Predefined dropdown options for audit notes
 */

export const dropdownOptions = [
  {
    Accessibility: [
      {
        value:
          "Lack of sufficient color contrast and focus indicators for interactive elements.",
      },
      {
        value:
          "Accessibility testing (e.g., screen reader compatibility, keyboard navigation) is lacking.",
      },
      {
        value:
          "Components need proper aria-labels and minimum touch target sizes for better accessibility.",
      },
    ],
  },
  {
    "Consistency Across Platforms": [
      {
        value:
          "Components vary between web and mobile versions, with no unified style guide.",
      },
      {
        value:
          "Mobile components aren't consistent with web designs in terms of layout and style.",
      },
      {
        value:
          "Variants for different platforms (iOS, Android, Web) are incomplete or missing.",
      },
    ],
  },
  {
    "Component Design": [
      {
        value:
          "Components lack essential properties (text, boolean, swap) and states (hover, focused, disabled).",
      },
      {
        value: "No atomic approach.",
      },
      {
        value:
          "Recipes are implemented as variants instead of using reusable elements.",
      },
      {
        value: "Complex components need more complete state and size variants.",
      },
    ],
  },
  {
    "Color Usage": [
      {
        value:
          "Colors are not organized into a clear system (primary, secondary, error, success).",
      },
      {
        value:
          "Inconsistent use of branding colors across components and lack of variants for light and dark modes.",
      },
      {
        value:
          "Color contrast issues in UI elements, affecting readability and accessibility.",
      },
    ],
  },
  {
    "Developer Handoff": [
      {
        value:
          "Redlines, measurements, and developer annotations are insufficient or unclear.",
      },
      {
        value:
          "Components lack proper spacing, sizing, and style tokens for easier developer handoff.",
      },
      {
        value:
          "No clear guidelines or annotations for implementing interactions and animations in development.",
      },
    ],
  },
  {
    Documentation: [
      {
        value: "Documentation is missing or outdated.",
      },
      {
        value:
          "Documentation on component usage and best practices is missing.",
      },
      {
        value: "No clear version history.",
      },
      {
        value:
          "Documentation lacks example use cases and guidelines for responsive design and accessibility.",
      },
    ],
  },
  {
    "Grid & Layout System": [
      {
        value: "Grid and layout systems are missing.",
      },
      {
        value: "Grid and layout are inconsistent across components.",
      },
      {
        value:
          "No clear guidelines on grid spacing, margins, or alignment of components within the grid.",
      },
      {
        value:
          "Layout and spacing inconsistencies affect the design's visual structure.",
      },
    ],
  },
  {
    Iconography: [
      {
        value:
          "Icons lack consistency in style (size, stroke, placement) and aren't aligned to a grid system.",
      },
      {
        value:
          "Icon variants for different states (active, disabled) or sizes are missing.",
      },
      {
        value:
          "Documentation for icon usage and size constraints is insufficient.",
      },
    ],
  },
  {
    "Interactions & Animations": [
      {
        value:
          "Interactive states and transitions (hover, focus, pressed) are incomplete or missing.",
      },
      {
        value:
          "Lack of motion guidelines (e.g., easing, timing) for consistent animations across components.",
      },
      {
        value:
          "Missing feedback for user interactions (e.g., loading spinners, success/error messages).",
      },
    ],
  },
  {
    "Naming/Labeling": [
      {
        value:
          "Lack consistent naming conventions (For components, frames, layers, and variants).",
      },
      {
        value: "Naming patterns are unclear (e.g., size, state, color).",
      },
    ],
  },
  {
    "Page Structure": [
      {
        value:
          "Page structure is unclear—difficult to distinguish between ready, draft, and WIP components.",
      },
      {
        value:
          "Sections and components need better organization with status indicators like WIP, review, or ready.",
      },
      {
        value:
          "Pages lack a standardized hierarchy and clear separation between foundational and complex components.",
      },
    ],
  },
  {
    Responsiveness: [
      {
        value:
          "Components are not responsive to content (hug/fill) or adaptive across breakpoints (desktop, mobile).",
      },
      {
        value:
          "Components don't resize properly based on layout constraints (e.g., grid or flex layouts).",
      },
    ],
  },
  {
    Redundancy: [
      {
        value: "Redundancy in component variants.",
      },
    ],
  },
  {
    Typography: [
      {
        value: "Inconsistent font sizes, line heights, and weights.",
      },
      {
        value:
          "Missing clear guidelines for typography usage (e.g., headers, body text).",
      },
      {
        value:
          "Typographic scale isn't applied consistently across different devices (mobile vs. desktop).",
      },
    ],
  },
  {
    "Version Control": [
      {
        value: "Lack of clear versioning for updates to the design system.",
      },
      {
        value:
          "No version control process to track component changes or releases.",
      },
      {
        value:
          "Difficulty in managing and archiving previous versions of components.",
      },
    ],
  },
  {
    "Visual Differentiation": [
      {
        value:
          "Covers should provide more information (version, owner, status) and be visually distinct.",
      },
      {
        value:
          "Covers need clearer visual distinction between DS files, product files, etc.",
      },
      {
        value:
          "Inconsistent use of visual cues to identify component status (WIP, final) or brand colors.",
      },
    ],
  },
];
