import { HttpStatus } from '@nestjs/common';
import { GROUP_CREATE_OUTCOME_UNKNOWN, GroupCreateOutcomeUnknownError } from './group-create-outcome-unknown.error';

describe('GroupCreateOutcomeUnknownError', () => {
  it('is a non-replayable 504 with a stable machine code and recovery guidance', () => {
    const err = new GroupCreateOutcomeUnknownError('Engineering 7');

    expect(err.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
    expect(err.getResponse()).toMatchObject({
      statusCode: HttpStatus.GATEWAY_TIMEOUT,
      error: 'Gateway Timeout',
      code: GROUP_CREATE_OUTCOME_UNKNOWN,
    });
    expect(err.message).toContain('Engineering 7');
    expect(err.message).toMatch(/check the session groups before retrying/i);
  });
});
