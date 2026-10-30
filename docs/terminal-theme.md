# Terminal appearance

The terminal shares the access screen's charcoal surfaces, neutral dividers, grey secondary text and green accent. Primary controls use dark text on green; negative values and warnings retain distinct semantic colors. Chart comparison series remain distinguishable.

This refresh changes paint only. The layout, breakpoints, type sizes/weights, line heights, box dimensions, spacing, border widths, radii and interaction behavior are preserved.

`node tests/ui/theme-geometry.cjs` checks all 449 existing layout/typography declarations against the pre-refresh stylesheet. The existing browser checks also render the previous stylesheet against the same DOM and compare visible HTML element rectangles to within 0.05 pixels on alerts, valuation dialogs, watchlist, analysis, portfolios, history, preferences and backtests. Recharts' animated plot internals are excluded from rectangle comparison; their fixed container dimensions remain checked. Both mobile and desktop viewports are covered.

The baseline in `tests/ui/fixtures/terminal-before-theme.css` is a test fixture and is not shipped to the application.
