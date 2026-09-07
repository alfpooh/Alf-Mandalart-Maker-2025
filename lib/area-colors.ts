/**
 * The eight area colours, for exports.
 *
 * On screen these come from the `--area-*` custom properties, which follow the
 * viewer's theme. A document does not have a theme — a slide deck opened on
 * someone else's machine has to carry its own colours — so the light values
 * are repeated here as literals.
 *
 * They must stay in step with the `:root` block in `app/globals.css`. Every
 * pair below clears WCAG AA against the text colour it is used with; see the
 * comment there for how they were chosen.
 */

/** Strong fill, carries white text. Index 0 is area 1. */
export const AREA_COLORS = [
  "B23A48",
  "A15C1E",
  "5F6E15",
  "2E7D5B",
  "1D7080",
  "2A5F9E",
  "5B4B9E",
  "93397A",
] as const

/** Light tint, carries the matching ink colour. */
export const AREA_SOFT = [
  "F7EBED",
  "F6EFE8",
  "EFF0E8",
  "EAF2EF",
  "E8F1F2",
  "EAEFF5",
  "EFEDF5",
  "F4EBF2",
] as const

/** Text colour for the tinted fill. */
export const AREA_INK = [
  "622028",
  "593310",
  "343D0C",
  "194532",
  "103E46",
  "173457",
  "322957",
  "511F43",
] as const

/** The centre of the grid: the goal everything else hangs off. */
export const AREA_CENTER = "1F2430"

/** Area colour by 1-based index, wrapping rather than throwing. */
export function areaColor(area: number): string {
  return AREA_COLORS[(area - 1) % AREA_COLORS.length]
}

export function areaSoft(area: number): string {
  return AREA_SOFT[(area - 1) % AREA_SOFT.length]
}

export function areaInk(area: number): string {
  return AREA_INK[(area - 1) % AREA_INK.length]
}
