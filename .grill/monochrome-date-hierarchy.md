# Grill: Monochrome Date Hierarchy
Date: 2026-09-21

## Intent
Make the GTD date view calmer and easier to scan by removing nonessential color while retaining immediate orientation around Today and Tomorrow.

## Constraints
- No colored section rails, fills, or accent treatment.
- Roles, priorities, checkbox rings, date pills, and section borders use neutral theme colors.
- Every date pill uses the same muted neutral treatment.
- Today and Tomorrow receive only brighter plain header text; no colored fill, border, rail, or date pill.
- Completed is collapsed by default each time the view opens, but remains manually expandable for the session.

## Key decisions
- Decision: Use brightness, not accent color, for Today and Tomorrow header hierarchy. Reason: preserve focus without reintroducing competing color signals. Alternative considered: a shared accent color.
- Decision: Remove color from roles and priorities while retaining their labels and icons. Reason: semantic meaning remains available without visual noise. Alternative considered: keeping identity and urgency hues.
- Decision: Apply one neutral date-pill style everywhere. Reason: date metadata should be consistent and subordinate to task text. Alternative considered: special colors for due, scheduled, overdue, and near dates.
- Decision: Remove all colored section rails. Reason: structure is already conveyed by header, count, and collapse state. Alternative considered: neutralizing only the purple date rails.
- Decision: Default Completed to collapsed. Reason: active work should own the initial view. Alternative considered: persist whichever expansion state was last used.

## Out of scope
- Changing task grouping, sorting, date semantics, role labels, priority behavior, or the Calendar sync feature.
