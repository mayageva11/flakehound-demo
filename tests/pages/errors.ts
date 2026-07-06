/** Domain errors with clean names, so JUnit stacks start "AssertionError:" /
 *  "TimeoutError:" — exactly the shape the flakehound normalizer clusters on. */

export class AssertionError extends Error {
  override name = 'AssertionError';
}

export class TimeoutError extends Error {
  override name = 'TimeoutError';
}
