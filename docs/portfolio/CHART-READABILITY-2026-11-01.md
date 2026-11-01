# Four-portfolio chart readability

The owner approved the readability mockup and requested a **solid yellow line** instead of its dotted/dashed preview. The comparison now uses a full-width chart below the cards, 3 px series, mint/blue/amber colours and a lighter dashed SPY reference. Card swatches and related portfolio colours match. The shared starting-capital reference and 13 px axis text make the scale easier to read.

Desktop charts with at least 900 px of available width show numbered endpoint names and values outside the plot. A small layout helper separates nearby annotations and clamps them within the chart; connectors retain each exact final coordinate. Narrow plots retain space for the data and use the labelled cards/shared tooltip. Four cards fit one desktop row, two tablet columns and compact phone rows down to 320 px.

Cards are native toggle buttons with pressed state, keyboard operation and accessible value descriptions. Selection emphasizes one series without hiding other tooltip values or changing the scale. Select again or Show all lines to restore the comparison. Recharts keyboard chart navigation is enabled. Phone tooltips stay inside the chart and disappear when neither pointer nor keyboard focus is within it.

**Presentation only:** all original input series and dates are used directly, with linear unsmoothed paths. Portfolio rules, allocation, price fetching, eligibility thresholds, persisted books and the 15/10 next-close policy are unchanged. Pending/mismatched fourth books retain the existing compatibility guard.

Validation: both TypeScript projects, 647 unit/invariant/golden checks, web/desktop builds and responsive English/German browser checks. Browser regressions verify the solid yellow path/swatch, distinct blue/mint colours, 3 px strokes, 13 px axes, full-width layout, nonoverlapping endpoint labels, native keyboard toggles, shared tooltip values and identical SVG curve paths before/after highlighting. The existing theme geometry contract remains intact; global CSS changes are limited to series paint tokens. Three focused annotation-layout tests cover clustered/bounded labels and preservation of the source coordinates.

The generated picture was illustrative. The implemented chart renders the real existing series; no generated chart data or replacement prices are used.
