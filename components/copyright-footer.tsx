/**
 * Fixed to the bottom of the viewport before, which meant it sat over the last
 * row of whatever was on screen — on a phone, over the grid itself. In normal
 * flow it ends the page instead of covering it.
 */
export function CopyrightFooter() {
  return (
    <footer className="border-t border-border bg-background px-4 py-3 text-center">
      <p className="text-xs text-muted-foreground">
        All rights reserved D.H. Alf Bae, 2025. Produced by Alf.
      </p>
    </footer>
  )
}
