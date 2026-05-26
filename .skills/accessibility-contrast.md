# Accessibility & Contrast Guidance

This guide defines text contrast, sizing, and color rules to ensure the Groomers Dog Parlour application meets accessibility standards, is highly legible on mobile devices, and is easy to navigate.

## 1. Contrast Standards & Color Rules

*   **Legible Field Labels**: Never use low-contrast grey (e.g. `text-slate-400` or `text-gray-400`) for input labels, headings, or important body text. Labels above form input fields must use **`text-slate-700` or stronger** (e.g. `text-slate-800` or `text-slate-900`) to guarantee a clear visual container.
*   **Secondary Helper Text**: Lighter colors (like `text-slate-500`) must be reserved exclusively for non-essential helper text, placeholders, or secondary labels.
*   **Contrasting Buttons**: Action buttons must have high contrast against their background. For example, solid brand buttons must use bold text and clear color weights. Outline buttons must use a clearly visible border.
*   **No Bad Red-on-Pink**: Do not overlay red text on light pink backgrounds unless the color combination exceeds WCAG AAA contrast ratio standards (4.5:1 for normal text, 3:1 for large text).
*   **Visible Focus States**: Ensure all interactive elements (inputs, buttons, links) have a visible focus outline when navigated via keyboard (e.g. `focus:outline-none focus:ring-2 focus:ring-indigo-500/20`).

---

## 2. Layout Sizing & Mobile Audits

*   **Touch Targets**: Buttons, checkboxes, and links must have a minimum interactive size of **44x44 pixels** on mobile screens to prevent misclicks.
*   **Font Scaling**: Do not set font sizes below `text-xs` (12px) for form inputs or labels. Keep headings large enough to convey section start clearly.
*   **Responsive Widths**: Ensure all layouts adapt to small screens without horizontal scrolling. Wrap tables or grids in container divs with horizontal overflow if necessary.
