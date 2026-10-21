import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyStripeWebhookSignature, getStripeConfig } from '@/lib/stripe';

describe('Stripe Integration', () => {
  describe('getStripeConfig', () => {
    it('prioritizes env over process.env', () => {
      const env = {
        STRIPE_SECRET_KEY: 'sk_test_env',
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_env',
        STRIPE_WEBHOOK_SECRET: 'whsec_test_env'
      };
      const config = getStripeConfig(env);
      expect(config.secretKey).toBe('sk_test_env');
      expect(config.publishableKey).toBe('pk_test_env');
      expect(config.webhookSecret).toBe('whsec_test_env');
    });
  });

  describe('verifyStripeWebhookSignature', () => {
    it('verifies valid HMAC-SHA256 signature correctly', async () => {
      const secret = 'whsec_test_secret_12345';
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ id: 'evt_123', type: 'checkout.session.completed' });

      // Compute HMAC signature manually
      const signedPayload = `${timestamp}.${payload}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
      const sigHex = Array.from(new Uint8Array(signatureBytes))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const sigHeader = `t=${timestamp},v1=${sigHex}`;
      const isValid = await verifyStripeWebhookSignature(payload, sigHeader, secret);
      expect(isValid).toBe(true);
    });

    it('rejects tampered payload', async () => {
      const secret = 'whsec_test_secret_12345';
      const timestamp = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({ id: 'evt_123' });
      const tampered = JSON.stringify({ id: 'evt_456' });

      const signedPayload = `${timestamp}.${payload}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
      const sigHex = Array.from(new Uint8Array(signatureBytes))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const sigHeader = `t=${timestamp},v1=${sigHex}`;
      const isValid = await verifyStripeWebhookSignature(tampered, sigHeader, secret);
      expect(isValid).toBe(false);
    });

    it('rejects expired timestamp (replay attack)', async () => {
      const secret = 'whsec_test_secret_12345';
      // 10 minutes ago
      const timestamp = Math.floor(Date.now() / 1000) - 600;
      const payload = JSON.stringify({ id: 'evt_123' });

      const signedPayload = `${timestamp}.${payload}`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
      const sigHex = Array.from(new Uint8Array(signatureBytes))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const sigHeader = `t=${timestamp},v1=${sigHex}`;
      const isValid = await verifyStripeWebhookSignature(payload, sigHeader, secret, 300);
      expect(isValid).toBe(false);
    });
  });
});
