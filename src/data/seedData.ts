import { Customer, Product, Order, OrderItem, PaymentTransaction } from '../types';

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    customer_id: 'a1b2c3d4-0001-4000-8000-000000000001',
    first_name: 'Elena',
    last_name: 'Rostova',
    email: 'elena.rostova@acme.dev',
    phone: '+1 (415) 555-0192',
    created_at: '2026-09-12T14:22:00Z',
  },
  {
    customer_id: 'a1b2c3d4-0002-4000-8000-000000000002',
    first_name: 'Marcus',
    last_name: 'Chen',
    email: 'marcus.chen@techfoundry.io',
    phone: '+1 (206) 555-0143',
    created_at: '2026-09-18T09:15:30Z',
  },
  {
    customer_id: 'a1b2c3d4-0003-4000-8000-000000000003',
    first_name: 'Amara',
    last_name: 'Okafor',
    email: 'amara.okafor@cloudscale.net',
    phone: '+44 20 7946 0991',
    created_at: '2026-09-25T18:40:12Z',
  },
  {
    customer_id: 'a1b2c3d4-0004-4000-8000-000000000004',
    first_name: 'Kaito',
    last_name: 'Tanaka',
    email: 'kaito.tanaka@tokyolabs.jp',
    phone: '+81 3 5555 0188',
    created_at: '2026-10-01T11:05:00Z',
  },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    product_id: 'p100-0000-0000-0000-000000000001',
    sku: 'HW-KB-001',
    title: 'Haptic Pro Mechanical Keyboard (Hot-swap RGB)',
    price: 189.00,
    stock_quantity: 15,
    reserved_quantity: 0,
    category: 'Hardware',
    description: 'Custom gasket-mount mechanical keyboard with pre-lubed switches and sound dampening.',
  },
  {
    product_id: 'p100-0000-0000-0000-000000000002',
    sku: 'AUDIO-DAC-90',
    title: 'Studio DAC & High-Res Headphone Amp',
    price: 349.50,
    stock_quantity: 8,
    reserved_quantity: 0,
    category: 'Audio',
    description: 'Balanced dual-mono architecture DAC capable of 32-bit/768kHz lossless playback.',
  },
  {
    product_id: 'p100-0000-0000-0000-000000000003',
    sku: 'LIMITED-GPU-TITAN',
    title: 'Limited Edition Tensor Workstation Accelerator',
    price: 1499.00,
    stock_quantity: 1, // High contention / race condition candidate!
    reserved_quantity: 0,
    category: 'Compute',
    description: 'Ultra-scarce compute card for local LLM inference and deep learning pipelines.',
  },
  {
    product_id: 'p100-0000-0000-0000-000000000004',
    sku: 'PWR-GAN-140',
    title: '140W GaN Triple-Port Fast Travel Charger',
    price: 79.99,
    stock_quantity: 42,
    reserved_quantity: 0,
    category: 'Accessories',
    description: 'Compact Gallium Nitride power adapter powering 2 laptops and a mobile phone simultaneously.',
  },
];

export const INITIAL_ORDERS: Order[] = [
  {
    order_id: 'ord-8f92-411a-942b-5813f0a00001',
    customer_id: 'a1b2c3d4-0001-4000-8000-000000000001',
    status: 'PAID',
    total_amount: 189.00,
    shipping_address: {
      street: '742 Evergreen Terrace',
      city: 'Springfield',
      postal_code: '97477',
      country_code: 'US',
    },
    created_at: '2026-10-04T10:14:22Z',
    updated_at: '2026-10-04T10:15:10Z',
    provider_tx_id: 'pi_3P5kH4LkdF6vLg2X1mQw8zRt',
  },
  {
    order_id: 'ord-3c44-4821-bc76-9218d0b00002',
    customer_id: 'a1b2c3d4-0002-4000-8000-000000000002',
    status: 'FULFILLED',
    total_amount: 429.49,
    shipping_address: {
      street: '404 Silicon Way, Suite 300',
      city: 'Seattle',
      postal_code: '98101',
      country_code: 'US',
    },
    created_at: '2026-10-05T08:20:10Z',
    updated_at: '2026-10-05T14:30:00Z',
    provider_tx_id: 'pi_3P6aB9NkcF1vYg7Z3rTv5wKp',
  },
];

export const INITIAL_ORDER_ITEMS: OrderItem[] = [
  {
    order_item_id: 'oi-0001-4000-8000-000000000001',
    order_id: 'ord-8f92-411a-942b-5813f0a00001',
    product_id: 'p100-0000-0000-0000-000000000001',
    quantity: 1,
    unit_price: 189.00,
    created_at: '2026-10-04T10:14:22Z',
  },
  {
    order_item_id: 'oi-0002-4000-8000-000000000002',
    order_id: 'ord-3c44-4821-bc76-9218d0b00002',
    product_id: 'p100-0000-0000-0000-000000000002',
    quantity: 1,
    unit_price: 349.50,
    created_at: '2026-10-05T08:20:10Z',
  },
  {
    order_item_id: 'oi-0003-4000-8000-000000000003',
    order_id: 'ord-3c44-4821-bc76-9218d0b00002',
    product_id: 'p100-0000-0000-0000-000000000004',
    quantity: 1,
    unit_price: 79.99,
    created_at: '2026-10-05T08:20:10Z',
  },
];

export const INITIAL_PAYMENT_TRANSACTIONS: PaymentTransaction[] = [
  {
    transaction_id: 'tx-0001-4000-8000-000000000001',
    order_id: 'ord-8f92-411a-942b-5813f0a00001',
    provider_transaction_id: 'pi_3P5kH4LkdF6vLg2X1mQw8zRt',
    amount: 189.00,
    status: 'SUCCESS',
    payload: {
      id: 'pi_3P5kH4LkdF6vLg2X1mQw8zRt',
      object: 'payment_intent',
      amount: 18900,
      currency: 'usd',
      status: 'succeeded',
      payment_method_types: ['card'],
      charges: {
        data: [
          {
            id: 'ch_3P5kH4LkdF6vLg2X1mQw8zRt',
            paid: true,
            receipt_url: 'https://pay.stripe.com/receipts/acct_demo/18900',
            payment_method_details: {
              card: { brand: 'visa', last4: '4242', funding: 'credit' },
            },
          },
        ],
      },
    },
    created_at: '2026-10-04T10:15:08Z',
  },
  {
    transaction_id: 'tx-0002-4000-8000-000000000002',
    order_id: 'ord-3c44-4821-bc76-9218d0b00002',
    provider_transaction_id: 'pi_3P6aB9NkcF1vYg7Z3rTv5wKp',
    amount: 429.49,
    status: 'SUCCESS',
    payload: {
      id: 'pi_3P6aB9NkcF1vYg7Z3rTv5wKp',
      object: 'payment_intent',
      amount: 42949,
      currency: 'usd',
      status: 'succeeded',
      charges: {
        data: [{ paid: true, receipt_number: 'REC-99412' }],
      },
    },
    created_at: '2026-10-05T08:21:40Z',
  },
];
