# Brand Motion Design Guidance

This guide outlines rules for implementing smooth, tasteful, and professional animations that support the Groomers brand experience without cluttering the UI or degrading system performance.

## 1. Principles of Motion

*   **Lightweight over Heavy**: Prefer CSS transitions/animations or lightweight Framer Motion/React transitions instead of loading heavy video clips or heavy animation libraries (e.g. huge Lottie files).
*   **Purposeful & Brand-Aligned**: Motion should serve a clear goal—guiding attention to a CTA, confirming successful booking, or softening UI state transitions. Do not add chaotic moving backgrounds, flying items, or interactive gimmicks.
*   **Aesthetic Accents**: Use warm, dog/grooming-themed accents (e.g., a subtle paw icon hover transition, soft sliding transitions on cards, fading details).
*   **Performance First**: Ensure animations run at 60fps on mobile. Limit animations to properties that do not trigger layout recalculations (e.g., animate `transform` and `opacity` rather than `width`, `height`, or `margin`).
*   **Landing Page Recommendations**: Prefer animated gradient blobs, subtle floating paw/grooming accents, and card entrance animations. Do not use heavy video background for V1 unless explicitly approved.

---

## 2. Accessibility & Reduced Motion

*   **prefers-reduced-motion**: Always respect browser and operating system accessibility settings. Check the CSS media query or React hooks to turn off or simplify animations when reduced motion is preferred:
    ```css
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-delay: -1ms !important;
        animation-duration: 1ms !important;
        animation-iteration-count: 1 !important;
        background-attachment: initial !important;
        scroll-behavior: auto !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    }
    ```
*   **Control over Autoplay**: Never autoplay heavy background videos. If a small video element is approved, ensure it has `muted`, `loop`, `playsinline` attributes, and can be easily paused.
