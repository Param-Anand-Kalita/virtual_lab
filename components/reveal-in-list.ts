/**
 * Scrolls `list` (and only `list`) so `item` is fully visible, along both axes. The page is never scrolled: that would
 * move the 3D view under a finger that is mid-gesture. A strip scrolls sideways, a vertical list scrolls up and down,
 * and setting the scroll offset of an axis that cannot scroll is a harmless no-op. The list's own padding is kept as a
 * margin, so the first and last items do not end up flush against the edge.
 */
export function revealInList(list: HTMLElement, item: HTMLElement) {
  const bounds = list.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  const style = getComputedStyle(list);
  const top = bounds.top + parseFloat(style.paddingTop) || bounds.top;
  const bottom = bounds.bottom - parseFloat(style.paddingBottom) || bounds.bottom;
  const left = bounds.left + parseFloat(style.paddingLeft) || bounds.left;
  const right = bounds.right - parseFloat(style.paddingRight) || bounds.right;
  if (rect.top < top) list.scrollTop -= top - rect.top;
  else if (rect.bottom > bottom) list.scrollTop += rect.bottom - bottom;
  if (rect.left < left) list.scrollLeft -= left - rect.left;
  else if (rect.right > right) list.scrollLeft += rect.right - right;
}
