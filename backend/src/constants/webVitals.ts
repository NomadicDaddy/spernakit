/**
 * Cumulative Layout Shift (CLS) threshold
 * Measures visual stability - lower is better
 */
const CLS_THRESHOLD = 0.1;

/**
 * First Contentful Paint (FCP) threshold in milliseconds
 * Time to first meaningful paint - lower is better
 */
const FCP_THRESHOLD = 1800;

/**
 * Interaction to Next Paint (INP) threshold in milliseconds
 * Measures input responsiveness - lower is better
 */
const INP_THRESHOLD = 200;

/**
 * Largest Contentful Paint (LCP) threshold in milliseconds
 * Time to largest contentful paint - lower is better
 */
const LCP_THRESHOLD = 2500;

/**
 * Time to First Byte (TTFB) threshold in milliseconds
 * Time to first byte from server - lower is better
 */
const TTFB_THRESHOLD = 600;

export { CLS_THRESHOLD, FCP_THRESHOLD, INP_THRESHOLD, LCP_THRESHOLD, TTFB_THRESHOLD };
