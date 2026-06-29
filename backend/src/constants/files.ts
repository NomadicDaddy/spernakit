/** Minimum buffer length required for magic byte detection (12 bytes covers most signatures) */
const MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES = 12;

/** Number of bytes in a megabyte */
const BYTES_PER_MB = 1024 * 1024;

/** Length of ISO date string slice for "YYYY-MM-DD" format */
const ISO_DATE_SLICE_LENGTH = 10;

export { BYTES_PER_MB, ISO_DATE_SLICE_LENGTH, MIN_BUFFER_LENGTH_FOR_MAGIC_BYTES };
