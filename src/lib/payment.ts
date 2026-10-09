export type PaymentMethodType =
  | 'alipay1'
  | 'alipay2'
  | 'alipay3'
  | 'wechat'
  | 'usdt';

export interface PaymentMethodConfig {
  id: PaymentMethodType;
  enabled: boolean;
  title: string;
  qrCodeUrl?: string;
  paymentUrl?: string;
  deepLink?: string;
  walletAddress?: string;
  network?: string;
}

export const defaultPaymentMethods: PaymentMethodConfig[] = [
  { id: 'alipay1', enabled: true, title: '支付宝1' },
  { id: 'alipay2', enabled: false, title: '支付宝2' },
  { id: 'alipay3', enabled: false, title: '支付宝3' },
  { id: 'wechat', enabled: true, title: '微信支付' },
  { id: 'usdt', enabled: true, title: 'USDT' },
];
