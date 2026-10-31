# Terminal design refresh

## Direction

- Product: a research workspace for insider transactions and unusual options activity.
- Character: precise, calm, legible.
- World: an analyst's instrument panel, graphite surfaces with restrained green feedback.
- Moments: the owner's supplied transparent logo, and the terminal's actual signal values and charts.
- Signature: a small green index beside the selected navigation item.

## Audit and changes

The access page used a promotional eyebrow, tightly tracked large headings, a decorative lock tile and small low-contrast help text. It now uses direct product copy, a visible input label, readable help text and a left-aligned form. The supplied mark stands alone in the top-right corner of access, admin and terminal screens. The original PNG and transparency are preserved.

The shell used floating navigation, icon tiles in every summary, heavy uppercase labels and repeated green surfaces. A continuous sidebar, quieter selection, tabular summary figures, neutral panels and consistent spacing now provide hierarchy. Existing navigation, data, scoring, filters, access checks and portfolio behavior are retained. Positive/negative data semantics remain distinct.

Motion explains interactions: short color feedback and a four-pixel view entrance. It does not animate market values or imply live activity. Reduced-motion preferences disable movement. Focus outlines and mobile touch targets remain visible.

## Sources and attribution

- Design audit and token guidance: [Unslop](https://github.com/heydamir/unslop), by Damir Sokolovsky (@heydamir), CC BY 4.0. This design process adapts the spacing, typography, neutral-surface and motion guidance to the owner's existing terminal. The owner-supplied logo intentionally takes precedence over the skill's generic advice about glossy marks.
- [Unlumen accessibility guidance](https://unlumen-ui-docs.vercel.app/docs/accessibility): implemented the recommended `MotionConfig reducedMotion="user"` policy at the application root.
- [SmoothUI Fade Through](https://smoothui.dev/docs/components/fade-through): adapted its fade-and-rise approach into a brief user-triggered view entrance; no rotating phrases, blur or timer. The implementation is custom, not a copied library component.
- [Animmaster hover examples](https://animmasterlib.dev/hovers): visual reference for restrained control feedback. Its downloadable components require purchase; no paid source was downloaded or included.

No credentials, QA sessions or test fixtures belong in the deployed source.
