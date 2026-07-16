# Product Requirements Document (PRD)

## Automated Design System Component QA Plugin

This document outlines the functional and structural requirements for an automated Quality Assurance (QA) plugin/tool designed to validate design components within a Design System library. The requirements are derived directly from the standard **DS Component QA Checklist** and the specific implementation heuristics discussed between Engineering (Dima) and Design (Shani).

---

## Technical Architecture & Core Logic

The tool will operate as a programmatic validator (e.g., a Figma plugin or CLI parser) that scans component sets, variants, layers, tokens, and prototyping properties.

While a **Human-in-the-Loop** model will always exist for nuanced creative choices, this tool serves to shorten the QA cycle by automatically catching structural, naming, tokens, and layout compliance bugs before components are pushed to production.

---

## Detailed Requirements per Checklist Item

### 1. Storybook Alignment + Note

* **Intent:** Ensure design system components correspond directly to their coded equivalents in Storybook, while tracking intentional deviations.
* **Automated Plugin Action:**
* Scan the component canvas for an explicit **Explanation Box / "Changes from SB" note component**.
* If the component perfectly mirrors Storybook, the plugin passes it. If structural differences exist, the plugin checks for the presence of the note component detailing why changes were made (e.g., absolute hex colors replaced with opacities, removed properties).
* *Output:* Flag a warning if structural variations are detected without an accompanying documentation note on the frame.



### 2. Components Naming Dev Alignment

* **Intent:** Align design layer component naming conventions with production codebase structures.
* **Automated Plugin Action:**
* Validate that the top-level Component Set name follows strict developer casing standards (e.g., **PascalCase** like `Button` or `NotificationTag`).
* Flag any generic, lowercase, or space-separated component master names.



### 3. Check All the Props (Broken Layouts & Overrides)

* **Intent:** Stress-test every permutation of a component's variants to ensure auto-layout rules, text fields, and icons don't break dynamically.
* **Automated Plugin Action:**
* **Text Stress Test:** Programmatically inject a long text string into text layers to verify that auto-layout wraps, hugs, or truncates appropriately without clipping or overlapping bounds.
* **Property Override Check:** Verify asset inheritance. For instance, when an icon variant is toggled inside a button, the plugin validates that the icon's color property correctly inherits the button's text token color rather than breaking or displaying an unlinked raw state.



### 4. Prop Names Aligned to Consolidated Catalogue

* **Intent:** Maintain a unified, predictable structural sequence for variant properties across all components in the library.
* **Automated Plugin Action:**
* Audit the sequence and naming of properties inside the component configuration.
* Ensure strict alignment with the global catalog order (e.g., `Size` must always appear first, followed by `Variant`, then `State`, then optional boolean switches like `Has Icon`).



### 5. Tokens (Styles & Variables)

* **Intent:** Absolute enforcement of the design system token architecture. Zero raw, unlinked values are permitted.
* **Automated Plugin Action:**
* Scan every layer property within the component set.
* **Fills & Strokes:** Must be bound to a Color Variable/Style token. Absolute hex values are rejected.
* **Typography:** All text layers must use a predefined Typography Style token.
* **Effects:** Drop shadows or blurs must be linked to Global Effect Styles.
* **Layout Spacing:** Auto-layout padding and gap properties must be bound to Spacing Variables.



### 6. Typography Desktop | Mobile Correlation

* **Intent:** Verify structural symmetry between desktop and mobile viewport adaptations of a component.
* **Automated Plugin Action:**
* Locate matched pairs of desktop and mobile component sets on the canvas.
* Verify that if a desktop component layer implements a certain typographic hierarchy (e.g., `Paragraph 2 Regular`), its corresponding mobile version automatically maps to the corresponding mobile typographic style (e.g., `Mobile/Paragraph 2 Regular`).



### 7. Responsiveness (+ Min-Max Bounds)

* **Intent:** Guarantee components resize fluidly across varying screen dimensions without collapsing or stretching infinitely.
* **Automated Plugin Action:**
* Simulate horizontal and vertical scaling on instances of the component.
* Audit layout settings to ensure explicit `min-width`, `max-width`, `min-height`, or `max-height` constraints are populated where structurally required.
* *Output:* Log a warning if a component collapses to 0px or lacks basic boundary parameters (e.g., *"Results: no min value found"*).



### 8. Icons / Illustrations / Logos Connected to Foundations

* **Intent:** Ensure all iconography utilized inside components stems from the single source of truth library.
* **Automated Plugin Action:**
* Inspect nested icon sub-components.
* Verify they are legitimate library instances originating directly from the approved **Foundations Library**.
* Flag copy-pasted raw vectors, unlinked SVG paths, or instances pointing to deprecated/legacy icon directories.



### 9. Layer Naming + Structure

* **Intent:** Keep the internal layer tree clean, semantic, and highly optimized for engineering translation.
* **Automated Plugin Action:**
* **Name Cleanliness:** Reject default Figma layer names (e.g., `Frame 1204`, `Group 2`, `Vector 4`). Text layers must be named cleanly (e.g., `label`, `title`).
* **Structural Redundancy:** Identify and flag empty or useless structural wrappers (e.g., a frame nested directly inside an identical auto-layout frame with no distinct padding, background, or layout adjustments).



### 10. 4px Grid Alignment

* **Intent:** Ensure spatial configurations strictly respect the layout grid.
* **Automated Plugin Action:**
* Check all spatial dimensions: width, height, padding, item gaps, margins, and corner radiuses.
* All absolute numerical values must be multiples of **4px** (with **2px** flags permitted strictly for micro-elements like borders or tight inline tags).
* *Exception Logic:* Top-level container width/height bounds are exempt from absolute 4px matching *only* if their parameters are natively governed by "Hug contents" or "Fill container" constraints.



### 11. Interaction (Hover Only)

* **Intent:** Prevent local interactive prototyping states inside the component library from conflicting with real-world application user journeys.
* **Automated Plugin Action:**
* Scan the Prototype transition properties mapped between variant frames.
* Validate that any micro-interaction is strictly declared as a **While Hovering** state.
* Flag and block any application-level interaction triggers such as `On Click` or `On Press`.



### 12. Description (Also Known As + Misprint Keywords)

* **Intent:** Guarantee searchable metadata and usage context are embedded directly inside the asset configuration window.
* **Automated Plugin Action:**
* Read the Figma Component Description field.
* Ensure it is populated and conforms to standard templates. It must include an **"Also known as:"** alias line (to aid designer search discovery) and documentation lookup keywords or links.



### 13. No Conflicts

* **Intent:** Block compilation errors before pushing updates to library consumers.
* **Automated Plugin Action:**
* Analyze the properties matrix of the entire component set.
* Flag any duplicate variant definitions (e.g., accidentally configuring two distinct layout frames with the exact same properties such as `Size=Medium, Variant=Primary, State=Default`).



### 14. Easy to Use (Nested Component Management)

* **Intent:** Prevent complex components from overwhelming end-users via messy configuration panels.
* **Automated Plugin Action:**
* Evaluate the overall depth of the internal component layer architecture.
* Count the total levels of nested component properties exposed to the parent panel. If property nesting depth exceeds a standard threshold (e.g., more than 2 deep), trigger an optimization suggestion to flatten or simplify the configuration.



### 15. Preferred (Instance Swapping)

* **Intent:** Restrict instance swapping fields to logical selections.
* **Automated Plugin Action:**
* For any exposed component instance swap property (such as an icon slot), check that **Preferred Values** are explicitly assigned.
* For instance, a status tag component must limit its swappable icon property list to context-appropriate icons (e.g., checkmarks, error symbols, alerts) rather than exposing the entire global icon catalog.



### 16. High Contrast (Accessibility / A11y)

* **Intent:** Maintain product accessibility standards automatically.
* **Automated Plugin Action:**
* Detect the background color token directly behind text layers inside the component variant frames.
* Calculate the relative color contrast ratio between the text token and its immediate background layer to ensure compliance with WCAG AA guidelines.



### 17. Themes (Core / DNA / OldNews)

* **Intent:** Validate that variables map cleanly across dynamic display scenarios without visual bugs.
* **Automated Plugin Action:**
* Programmatically switch the parent page or component frame through all designated Design System theme collection modes (`Core`, `DNA`, `OldNews`).
* Scan for unlinked references, invisible text (foreground matching background color due to bad theme mapping), or broken variable style fallbacks.



### 18. Page Template

* **Intent:** Enforce spatial and presentation visual hygiene on the internal Design System delivery canvas.
* **Automated Plugin Action:**
* Verify the presentation canvas respects the official internal delivery template layout. Ensure structural headers, anatomy breakdowns, usage specs, and component frames are neatly sorted into their assigned regions.



### 19. Documentation

* **Intent:** Confirm that no component ships to production without its corresponding implementation manual.
* **Automated Plugin Action:**
* Check for the presence of a dedicated text or linked reference block containing usage guidelines, code behavior expectations, and engineering specs. Components lacking a minimum threshold of instructional content will trigger a documentation warning flag.


Framelist design:
https://www.figma.com/design/CdytzPWDTc7npImeQG0Pnc/%F0%9F%91%BA-Dima-s-other-tests?node-id=2950-606&t=jpvLZa9PFBh039Mk-11
