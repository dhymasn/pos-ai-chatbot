'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Send, ShoppingBag, Globe, Sparkles,
  AlertTriangle, CheckCircle2, Plus, Trash2, Loader2
} from 'lucide-react';
import { dictionary, Language } from '@/lib/i18n';

interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  selling_price: number;
  stock: number;
  min_stock_threshold: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function PosEnterprisePage() {
  const [lang, setLang] = useState<Language>('id');
  const t = dictionary[lang];

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProducts(data);
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoadingAi]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const totalAmount = cart.reduce(
    (sum, item) => sum + Number(item.product.selling_price) * item.qty,
    0
  );

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    if (!textToSend.trim() || isLoadingAi) return;

    const updatedMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: textToSend },
    ];
    setMessages(updatedMessages);
    setInput('');
    setIsLoadingAi(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, lang }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply || data.error },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Connection error to Groq AI Engine.' },
      ]);
    } finally {
      setIsLoadingAi(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-lg tracking-tight text-white">{t.appTitle}</h1>
            <p className="text-xs text-slate-400">{t.subtitle}</p>
          </div>
        </div>

        {/* Language Switcher */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setLang(lang === 'id' ? 'en' : 'id')}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium transition-colors"
        >
          <Globe className="w-4 h-4 text-indigo-400" />
          <span>{lang === 'id' ? 'Bahasa Indonesia' : 'English'}</span>
        </motion.button>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-[1600px] w-full mx-auto">
        {/* Left: POS Product Grid & Cart (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((product, idx) => {
              const isLowStock = product.stock <= product.min_stock_threshold;
              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ y: -2 }}
                  onClick={() => addToCart(product)}
                  className="cursor-pointer p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-indigo-500/50 transition-all flex flex-col justify-between group"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <span className="text-[11px] font-mono text-slate-400">{product.sku}</span>
                      <h3 className="font-medium text-slate-100 group-hover:text-indigo-300 transition-colors">
                        {product.name}
                      </h3>
                    </div>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isLowStock
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {isLowStock ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                      Stok: {product.stock}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-base font-semibold text-white">
                      Rp {Number(product.selling_price).toLocaleString('id-ID')}
                    </span>
                    <span className="p-1.5 rounded-lg bg-slate-800 group-hover:bg-indigo-600 text-slate-300 group-hover:text-white transition-colors">
                      <Plus className="w-4 h-4" />
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Active Cart Summary */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex-1 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                  {t.posMenu}
                </h2>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Reset
                  </button>
                )}
              </div>
              {cart.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">{t.emptyCart}</p>
              ) : (
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex justify-between items-center text-sm bg-slate-800/50 px-3.5 py-2.5 rounded-xl"
                    >
                      <span>
                        {item.product.name}{' '}
                        <strong className="text-indigo-400">x{item.qty}</strong>
                      </span>
                      <span className="font-mono">
                        Rp {(Number(item.product.selling_price) * item.qty).toLocaleString('id-ID')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">{t.total}</p>
                <p className="text-xl font-bold text-white">
                  Rp {totalAmount.toLocaleString('id-ID')}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={cart.length === 0}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-medium text-sm text-white shadow-lg shadow-indigo-600/20 transition-all"
              >
                {t.checkout}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Right: Groq AI Operational Copilot (5 Cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col h-[680px] overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  {t.aiAssistantTitle}
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                </h2>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Groq LPU • TiDB Live SQL
                </span>
              </div>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-sm'
                        : 'bg-slate-800/90 text-slate-200 border border-slate-700/70 rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoadingAi && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/40 w-fit px-3.5 py-2 rounded-full"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                <span>Querying TiDB & Analyzing SOP...</span>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Operational Prompts */}
          <div className="px-4 py-2 flex gap-2 overflow-x-auto border-t border-slate-800/60 bg-slate-900/50">
            {t.quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(qp)}
                className="text-xs whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                {qp}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-3 bg-slate-900 border-t border-slate-800 flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.aiPlaceholder}
              className="flex-1 bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <motion.button
              whileTap={{ scale: 0.95 }}
              type="submit"
              disabled={isLoadingAi || !input.trim()}
              className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
            >
              <Send className="w-4 h-4" />
            </motion.button>
          </form>
        </div>
      </main>
    </div>
  );
}