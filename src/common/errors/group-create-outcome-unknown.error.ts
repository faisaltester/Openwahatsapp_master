import { GatewayTimeoutException, HttpStatus } from '@nestjs/common';

/** Stable response code for a timed-out, non-idempotent group creation. */
export const GROUP_CREATE_OUTCOME_UNKNOWN = 'GROUP_CREATE_OUTCOME_UNKNOWN';

/**
 * Group creation reached the WhatsApp transport, but no confirmation arrived before OpenWA's
 * deadline. The underlying request cannot be cancelled, so the group may still have been created.
 *
 * This is deliberately HTTP 504 rather than {@link EngineTransportError}'s 503. OpenWA SDKs may
 * replay a POST after a 503 because it normally means backpressure before the operation started;
 * they do not replay a POST after a 504, whose outcome is ambiguous. That distinction prevents a
 * slow-but-successful create from being repeated into duplicate groups.
 */
export class GroupCreateOutcomeUnknownError extends GatewayTimeoutException {
  constructor(groupName: string, reason = 'WhatsApp did not confirm creation in time') {
    super({
      statusCode: HttpStatus.GATEWAY_TIMEOUT,
      message:
        `${reason} for group "${groupName}". The group may still ` +
        'have been created; list and check the session groups before retrying.',
      error: 'Gateway Timeout',
      code: GROUP_CREATE_OUTCOME_UNKNOWN,
    });
  }
}
