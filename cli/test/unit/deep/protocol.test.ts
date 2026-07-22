import { describe, it, expect } from 'vitest';
import { createSuccessEnvelope, createErrorEnvelope } from '../../src/protocol.js';

describe('protocol', () => {
    describe('createSuccessEnvelope', () => {
        it('wraps data in ok envelope', () => {
            const env = createSuccessEnvelope({ count: 5 });
            expect(env.status).toBe('ok');
            expect(env.data).toEqual({ count: 5 });
            expect(env.error).toBeNull();
            expect(env.hint).toBeNull();
        });

        it('wraps null-able data', () => {
            const env = createSuccessEnvelope(null);
            expect(env.status).toBe('ok');
            expect(env.data).toBeNull();
        });
    });

    describe('createErrorEnvelope', () => {
        it('creates error envelope with defaults', () => {
            const env = createErrorEnvelope('CODE', 'message');
            expect(env.status).toBe('error');
            expect(env.data).toBeNull();
            expect(env.error?.code).toBe('CODE');
            expect(env.error?.message).toBe('message');
            expect(env.error?.retryable).toBe(false);
        });

        it('accepts retryable and details', () => {
            const env = createErrorEnvelope('ERR', 'fail', {
                retryable: true,
                details: { key: 'value' },
                hint: 'try again',
            });
            expect(env.error?.retryable).toBe(true);
            expect(env.error?.details).toEqual({ key: 'value' });
            expect(env.hint).toBe('try again');
        });
    });
});
