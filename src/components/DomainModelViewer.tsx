import React, { useState } from 'react';
import { 
  Boxes, 
  Layers, 
  ArrowRight, 
  Database, 
  Code, 
  CheckCircle2, 
  Info,
  Table,
  Cpu
} from 'lucide-react';
import { Customer, Product, Order, OrderItem } from '../types';

interface EntityField {
  name: string;
  type: string;
  isPk?: boolean;
  isFk?: boolean;
  isUnique?: boolean;
  required?: boolean;
  index?: string;
  desc?: string;
}

interface EntityDefinition {
  id: string;
  name: string;
  type: string;
  description: string;
  fields: EntityField[];
  relationships: { type: string; target: string; label: string }[];
  methods: { signature: string; desc: string }[];
  liveCount: number;
  sampleData: any[];
}

interface DomainModelViewerProps {
  customers: Customer[];
  products: Product[];
  orders: Order[];
  orderItems: OrderItem[];
}

export const DomainModelViewer: React.FC<DomainModelViewerProps> = ({
  customers,
  products,
  orders,
  orderItems,
}) => {
  const [selectedEntity, setSelectedEntity] = useState<string>('Order');

  const entities: EntityDefinition[] = [
    {
      id: 'Customer',
      name: 'Customer',
      type: 'Entity (Aggregate Root)',
      description: 'Shopper identity with unique email constraint and order history.',
      fields: [
        { name: 'customer_id', type: 'UUID', isPk: true, desc: 'Primary Key gen_random_uuid()' },
        { name: 'first_name', type: 'VARCHAR(100)', required: true },
        { name: 'last_name', type: 'VARCHAR(100)', required: true },
        { name: 'email', type: 'VARCHAR(255)', required: true, isUnique: true, index: 'idx_customers_email' },
        { name: 'phone', type: 'VARCHAR(30)' },
        { name: 'created_at', type: 'TIMESTAMPTZ', desc: 'DEFAULT CURRENT_TIMESTAMP' },
      ],
      relationships: [
        { type: '1 to *', target: 'Order', label: 'places' },
      ],
      methods: [],
      liveCount: customers.length,
      sampleData: customers,
    },
    {
      id: 'Address',
      name: 'Address',
      type: 'Value Object (Embedded JSONB)',
      description: 'Immutable delivery destination. Captured inside Order JSONB column for audit permanence.',
      fields: [
        { name: 'street', type: 'String', required: true },
        { name: 'city', type: 'String', required: true },
        { name: 'postal_code', type: 'String', required: true },
        { name: 'country_code', type: 'String', required: true },
      ],
      relationships: [
        { type: '1 to 1', target: 'Order', label: 'ships to' },
      ],
      methods: [],
      liveCount: orders.length,
      sampleData: orders.map(o => o.shipping_address),
    },
    {
      id: 'Order',
      name: 'Order',
      type: 'Entity (Aggregate Root)',
      description: 'State machine managing total cost, payment lifecycle, and item composition.',
      fields: [
        { name: 'order_id', type: 'UUID', isPk: true, desc: 'Primary Key' },
        { name: 'customer_id', type: 'UUID', isFk: true, desc: 'FK -> customers(customer_id)' },
        { name: 'status', type: 'OrderStatus', desc: "ENUM ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED')" },
        { name: 'total_amount', type: 'NUMERIC(12,2)', desc: 'Sum of item subtotals' },
        { name: 'created_at', type: 'TIMESTAMPTZ' },
        { name: 'updated_at', type: 'TIMESTAMPTZ' },
      ],
      relationships: [
        { type: '1 to 1..*', target: 'OrderItem', label: 'contains (Composition)' },
        { type: '* to 1', target: 'Customer', label: 'placed by' },
      ],
      methods: [
        { signature: '+ calculateTotal(): Decimal', desc: 'Recalculates sum of all OrderItem subtotals' },
        { signature: '+ addItem(product_id: UUID, qty: Int, unit_price: Decimal): Void', desc: 'Appends item to composition' },
        { signature: '+ transitionTo(new_status: OrderStatus): Void', desc: 'State-machine transition with rule validation' },
      ],
      liveCount: orders.length,
      sampleData: orders,
    },
    {
      id: 'OrderItem',
      name: 'OrderItem',
      type: 'Entity (Child of Order)',
      description: 'Composition item capturing frozen snapshot of unit price at order creation time.',
      fields: [
        { name: 'order_item_id', type: 'UUID', isPk: true },
        { name: 'order_id', type: 'UUID', isFk: true, desc: 'FK -> orders(order_id) ON DELETE CASCADE' },
        { name: 'product_id', type: 'UUID', isFk: true, desc: 'FK -> products(product_id) ON DELETE RESTRICT' },
        { name: 'quantity', type: 'INT', desc: 'CHECK (quantity > 0)' },
        { name: 'unit_price', type: 'NUMERIC(12,2)', desc: 'Captured price at order time' },
        { name: 'created_at', type: 'TIMESTAMPTZ' },
      ],
      relationships: [
        { type: '* to 1', target: 'Order', label: 'part of' },
        { type: '* to 1', target: 'Product', label: 'references' },
      ],
      methods: [
        { signature: '+ getSubtotal(): Decimal', desc: 'Returns quantity * unit_price' },
      ],
      liveCount: orderItems.length,
      sampleData: orderItems,
    },
    {
      id: 'Product',
      name: 'Product',
      type: 'Entity (Inventory Root)',
      description: 'Catalog item with atomic inventory tracking (stock_quantity and reserved_quantity).',
      fields: [
        { name: 'product_id', type: 'UUID', isPk: true },
        { name: 'sku', type: 'VARCHAR(64)', isUnique: true, index: 'idx_products_sku' },
        { name: 'title', type: 'VARCHAR(255)' },
        { name: 'price', type: 'NUMERIC(12,2)' },
        { name: 'stock_quantity', type: 'INT', desc: 'Available unreserved stock (CHECK >= 0)' },
        { name: 'reserved_quantity', type: 'INT', desc: 'Temporarily held during checkout (CHECK >= 0)' },
      ],
      relationships: [
        { type: '1 to *', target: 'OrderItem', label: 'referenced by' },
      ],
      methods: [
        { signature: '+ atomicReserve(qty: Int): Boolean', desc: 'Conditional decrement where stock >= qty' },
        { signature: '+ commitReserved(qty: Int): Void', desc: 'Decrements reserved_quantity after payment' },
        { signature: '+ rollbackReserved(qty: Int): Void', desc: 'Restores reserved stock back to available pool' },
      ],
      liveCount: products.length,
      sampleData: products,
    },
  ];

  const current = entities.find(e => e.id === selectedEntity) || entities[2];

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Boxes className="w-4 h-4" />
              </span>
              <h2 className="font-bold text-base text-zinc-100">
                Domain Model &amp; Entity Relationships
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Interactive UML representation matching Diagram 2. Highlights composition patterns, foreign key cascades, and atomic domain methods.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">Select Entity:</span>
            <div className="flex flex-wrap gap-1">
              {entities.map(e => (
                <button
                  key={e.id}
                  onClick={() => setSelectedEntity(e.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-medium border transition ${
                    selectedEntity === e.id
                      ? 'bg-amber-500 text-zinc-950 font-bold border-amber-500 shadow-sm'
                      : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Visual UML Model Architecture Map */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm overflow-x-auto">
        <div className="min-w-[780px] space-y-6">
          <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-2">
            Visual UML Schema Architecture (Click any class node)
          </div>

          {/* Row 1: Customer & Address */}
          <div className="grid grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Customer Box */}
            <div
              onClick={() => setSelectedEntity('Customer')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition select-none ${
                selectedEntity === 'Customer'
                  ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-500/30'
                  : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
              }`}
            >
              <div className="text-center font-bold text-sm text-zinc-100 border-b border-zinc-800 pb-2">
                Customer
              </div>
              <div className="py-2 space-y-0.5 text-[11px] font-mono text-zinc-400">
                <div>- customer_id: UUID (PK)</div>
                <div>- first_name: String</div>
                <div>- last_name: String</div>
                <div>- email: String (UNIQUE)</div>
                <div>- phone: String</div>
              </div>
            </div>

            {/* Address Box */}
            <div
              onClick={() => setSelectedEntity('Address')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition select-none ${
                selectedEntity === 'Address'
                  ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-500/30'
                  : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
              }`}
            >
              <div className="text-center font-bold text-sm text-zinc-100 border-b border-zinc-800 pb-2">
                Address
              </div>
              <div className="py-2 space-y-0.5 text-[11px] font-mono text-zinc-400">
                <div>- street: String</div>
                <div>- city: String</div>
                <div>- postal_code: String</div>
                <div>- country_code: String</div>
              </div>
            </div>
          </div>

          {/* Association connectors to Order */}
          <div className="grid grid-cols-2 gap-8 max-w-3xl mx-auto text-center text-xs font-mono text-amber-400">
            <div>
              <div className="h-4 border-r-2 border-dashed border-zinc-600 mx-auto w-0"></div>
              <span>1 places *</span>
              <div className="h-4 border-r-2 border-dashed border-zinc-600 mx-auto w-0"></div>
            </div>
            <div>
              <div className="h-4 border-r-2 border-dashed border-zinc-600 mx-auto w-0"></div>
              <span>1 ships to 1</span>
              <div className="h-4 border-r-2 border-dashed border-zinc-600 mx-auto w-0"></div>
            </div>
          </div>

          {/* Row 2: Order (Central Root) */}
          <div className="max-w-2xl mx-auto">
            <div
              onClick={() => setSelectedEntity('Order')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition select-none ${
                selectedEntity === 'Order'
                  ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-500/30'
                  : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
              }`}
            >
              <div className="text-center font-bold text-sm text-zinc-100 border-b border-zinc-800 pb-2 flex items-center justify-center gap-2">
                <span>Order</span>
                <span className="text-[10px] font-mono bg-zinc-800 px-2 py-0.5 rounded text-amber-300">
                  Aggregate Root
                </span>
              </div>
              <div className="py-2.5 grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-400 border-b border-zinc-800">
                <div>- order_id: UUID (PK)</div>
                <div>- total_amount: Decimal</div>
                <div>- customer_id: UUID (FK)</div>
                <div>- created_at: Timestamp</div>
                <div>- status: OrderStatus [PENDING, PAID, FULFILLED, CANCELLED]</div>
                <div>- updated_at: Timestamp</div>
              </div>
              <div className="pt-2 text-[11px] font-mono text-emerald-400 space-y-0.5">
                <div>+ calculateTotal(): Decimal</div>
                <div>+ addItem(product_id: UUID, qty: Int, unit_price: Decimal): Void</div>
                <div>+ transitionTo(new_status: OrderStatus): Void</div>
              </div>
            </div>
          </div>

          {/* Connector to OrderItem & Product */}
          <div className="text-center text-xs font-mono text-amber-400">
            <div className="h-4 border-r-2 border-dashed border-zinc-600 mx-auto w-0"></div>
            <span>1 contains (Composition) 1..*</span>
            <div className="h-4 border-r-2 border-dashed border-zinc-600 mx-auto w-0"></div>
          </div>

          {/* Row 3: OrderItem and Product */}
          <div className="grid grid-cols-2 gap-8 max-w-3xl mx-auto items-center">
            {/* OrderItem */}
            <div
              onClick={() => setSelectedEntity('OrderItem')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition select-none ${
                selectedEntity === 'OrderItem'
                  ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-500/30'
                  : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
              }`}
            >
              <div className="text-center font-bold text-sm text-zinc-100 border-b border-zinc-800 pb-2">
                OrderItem
              </div>
              <div className="py-2 space-y-0.5 text-[11px] font-mono text-zinc-400 border-b border-zinc-800">
                <div>- order_item_id: UUID (PK)</div>
                <div>- order_id: UUID (FK CASCADE)</div>
                <div>- product_id: UUID (FK RESTRICT)</div>
                <div>- unit_price: Decimal (Snapshot)</div>
                <div>- quantity: Int (&gt; 0)</div>
              </div>
              <div className="pt-2 text-[11px] font-mono text-emerald-400">
                + getSubtotal(): Decimal
              </div>
            </div>

            {/* Product */}
            <div
              onClick={() => setSelectedEntity('Product')}
              className={`border-2 rounded-xl p-4 cursor-pointer transition select-none ${
                selectedEntity === 'Product'
                  ? 'border-amber-400 bg-amber-500/10 ring-2 ring-amber-500/30'
                  : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
              }`}
            >
              <div className="text-center font-bold text-sm text-zinc-100 border-b border-zinc-800 pb-2 flex items-center justify-center gap-1.5">
                <span>Product</span>
                <span className="text-[10px] font-mono bg-zinc-800 text-amber-300 px-1.5 py-0.5 rounded">
                  Stock
                </span>
              </div>
              <div className="py-2 space-y-0.5 text-[11px] font-mono text-zinc-400 border-b border-zinc-800">
                <div>- product_id: UUID (PK)</div>
                <div>- sku: String (UNIQUE)</div>
                <div>- title: String</div>
                <div>- price: Decimal</div>
                <div>- stock_quantity: Int (&gt;= 0)</div>
                <div>- reserved_quantity: Int (&gt;= 0)</div>
              </div>
              <div className="pt-2 text-[11px] font-mono text-emerald-400 space-y-0.5">
                <div>+ atomicReserve(qty): Boolean</div>
                <div>+ commitReserved(qty): Void</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Entity Details Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Fields and constraints */}
        <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-100">{current.name} Schema Specification</h3>
              <p className="text-xs text-zinc-400">{current.description}</p>
            </div>
            <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              {current.liveCount} live rows
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 font-mono text-[11px]">
                  <th className="pb-2">Field</th>
                  <th className="pb-2">SQL Type</th>
                  <th className="pb-2">Attributes / Constraints</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                {current.fields.map(f => (
                  <tr key={f.name} className="hover:bg-zinc-800/30">
                    <td className="py-2 text-zinc-200 font-semibold">{f.name}</td>
                    <td className="py-2 text-amber-300">{f.type}</td>
                    <td className="py-2 text-zinc-400">
                      {f.isPk && <span className="text-amber-400 font-bold mr-2">[PK]</span>}
                      {f.isFk && <span className="text-sky-400 font-bold mr-2">[FK]</span>}
                      {f.isUnique && <span className="text-emerald-400 mr-2">[UNIQUE]</span>}
                      {f.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {current.methods.length > 0 && (
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
                Domain Business Methods
              </div>
              <div className="space-y-1.5 font-mono text-[11px]">
                {current.methods.map(m => (
                  <div key={m.signature} className="bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                    <div className="text-emerald-400 font-semibold">{m.signature}</div>
                    <div className="text-zinc-500 text-[10px] mt-0.5">{m.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Database Rows Viewer */}
        <div className="lg:col-span-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-amber-400" />
              <h3 className="font-bold text-sm text-zinc-100">Live Database Instances ({current.name})</h3>
            </div>
            <span className="text-[11px] text-zinc-500 font-mono">
              In-Memory Relational Engine
            </span>
          </div>

          <pre className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 font-mono text-[11px] text-zinc-300 overflow-x-auto max-h-[380px] scrollbar-thin">
            {JSON.stringify(current.sampleData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
};
