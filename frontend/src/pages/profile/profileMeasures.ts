/**
 * A reading measure for card descriptions on this surface.
 *
 * With the page's width cap gone the cards run the full canvas, and muted prose laid out at 718px
 * already wrapped into ~105-character lines — the widest run of text anywhere on the page and well
 * past the ~65 characters the baseline sets for body copy. The controls below are capped to their
 * content for the same reason; the card is wide, the words inside it are not.
 */
export const DESCRIPTION_MEASURE = 'max-w-prose';

/**
 * One width for every single-line text field on this surface.
 *
 * Username was `max-w-xs` and the two fields in the card directly below it were `max-w-sm`, so the
 * inputs on one page stopped at 320px and 384px for no reason a reader could name — visible as a
 * 64px stagger down the left column at every width above `sm`. `max-w-sm` is the one already in the
 * majority here and the only one PasswordForm uses, so it is the value the odd field moves to.
 */
export const FIELD_MEASURE = 'max-w-sm';
