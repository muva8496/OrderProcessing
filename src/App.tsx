/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Header, ActiveTab } from './components/Header';
import { SequenceSimulator } from './components/SequenceSimulator';
import { ConcurrencyLab } from './components/ConcurrencyLab';
import { DomainModelViewer } from './components/DomainModelViewer';
import { SqlWorkbench } from './components/SqlWorkbench';
import { StorefrontView } from './components/StorefrontView';
import { EventAuditLog } from './components/EventAuditLog';
import { ArchitectureDocs } from './components/ArchitectureDocs';
import { db } from './services/dbStore';
import { Customer, Product, Order, OrderItem, DomainEvent } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('sequence');

  // Synchronized in-memory database states
  const [customers, setCustomers] = useState<Customer[]>(() => db.getCustomers());
  const [products, setProducts] = useState<Product[]>(() => db.getProducts());
  const [orders, setOrders] = useState<Order[]>(() => db.getOrders());
  const [orderItems, setOrderItems] = useState<OrderItem[]>(() => db.getOrderItems());
  const [events, setEvents] = useState<DomainEvent[]>(() => db.getDomainEvents());

  // Subscribe to live database mutations
  useEffect(() => {
    const unsubscribe = db.subscribe(() => {
      setCustomers(db.getCustomers());
      setProducts(db.getProducts());
      setOrders(db.getOrders());
      setOrderItems(db.getOrderItems());
      setEvents(db.getDomainEvents());
    });
    return () => unsubscribe();
  }, []);

  const handleResetDb = () => {
    db.reset();
  };

  const totalReservedUnits = products.reduce((acc, p) => acc + p.reserved_quantity, 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onResetDb={handleResetDb}
        orderCount={orders.length}
        totalReserved={totalReservedUnits}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Tab Content */}
        {activeTab === 'sequence' && (
          <SequenceSimulator customers={customers} products={products} />
        )}

        {activeTab === 'concurrency' && (
          <ConcurrencyLab products={products} customers={customers} />
        )}

        {activeTab === 'domain_model' && (
          <DomainModelViewer
            customers={customers}
            products={products}
            orders={orders}
            orderItems={orderItems}
          />
        )}

        {activeTab === 'sql_workbench' && (
          <SqlWorkbench products={products} />
        )}

        {activeTab === 'storefront' && (
          <StorefrontView products={products} customers={customers} />
        )}

        {activeTab === 'docs' && (
          <ArchitectureDocs />
        )}

        {/* Global Event Stream & Audit Log */}
        <EventAuditLog events={events} />
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-6 mt-12 text-center text-xs text-zinc-500 font-mono">
        <div className="max-w-7xl mx-auto px-4">
          OrderPulse Architecture Simulator · Sequence Lifelines · Domain Model &middot; Atomic SQL Reservation Engine
        </div>
      </footer>
    </div>
  );
}
