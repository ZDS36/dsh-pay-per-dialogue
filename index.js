/**
 * Host half of the usage-cost bundle.
 *
 * The feature is a pure Client presentation over data other packages already
 * serve: the account Remote for the wallet balance and the shipped Session
 * projections (`tokenUsage`, `modelSelection`) for token accounting. The
 * Session transportation validates projection values against a closed key
 * set, so this half deliberately registers nothing.
 */
export function apply() {}
