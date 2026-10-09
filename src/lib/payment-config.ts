import type { PaymentChannels } from './types';

export type PaymentChannelKey = 'alipay_primary' | 'alipay' | 'alipay_qr' | 'wechat' | 'usdt';

export interface PaymentOption {
  key: PaymentChannelKey;
  label: string;
  enabled: boolean;
  qrUrl?: string;
  payUrl?: string;
  network?: string;
  address?: string;
}

export function getPaymentOptions(config: PaymentChannels | null | undefined): PaymentOption[] {
  const payment = config ?? {};

  return [
    {
      key: 'alipay_primary',
      label: '支付宝1',
      enabled: Boolean(payment.alipay_primary?.qr_url),
      qrUrl: payment.alipay_primary?.qr_url,
    },
    {
      key: 'alipay',
      label: '支付宝2',
      enabled: Boolean(payment.alipay?.qr_url || payment.alipay?.account),
      qrUrl: payment.alipay?.qr_url,
    },
    {
      key: 'alipay_qr',
      label: '支付宝3',
      enabled: Boolean(payment.alipay_qr?.qr_url),
      qrUrl: payment.alipay_qr?.qr_url,
    },
    {
      key: 'wechat',
      label: '微信支付',
      enabled: Boolean(payment.wechat?.qr_url),
      qrUrl: payment.wechat?.qr_url,
    },
    {
      key: 'usdt',
      label: 'USDT',
      enabled: Boolean(payment.usdt?.address),
      network: payment.usdt?.network,
      address: payment.usdt?.address,
    },
  ].filter((item) => item.enabled);
}
