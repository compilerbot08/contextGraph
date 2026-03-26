import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ThemeToggle from './ThemeToggle';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const SUGGESTIONS = [
  "Top 5 Invoices by value",
  "High net weight products",
  "Trace order 740510",
  "Find customers in USA",
  "Recently created orders"
];

export default function ChatWindow({ onResultsHighlight, onResetGraph }) {
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'system',
      text: 'Welcome to the Context Graph System. Ask me questions about orders, deliveries, invoices, or customers!',
      timestamp: new Date().toISOString(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNewChat = () => {
    setMessages([{
      id: 1,
      sender: 'system',
      text: 'New chat started. How can I help you today?',
      timestamp: new Date().toISOString(),
    }]);
    if (onResetGraph) onResetGraph();
  };

  const reZoom = (nodes) => {
    if (onResultsHighlight) {
       // Re-triggering the same highlight to force GraphViewer to re-run its zoom effect
       onResultsHighlight([...nodes]);
    }
  };

  const handleSend = async (queryText) => {
    const text = typeof queryText === 'string' ? queryText : input.trim();
    if (!text || isLoading) return;

    const userMessage = {
      id: Date.now(),
      sender: 'user',
      text: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/chat`, { query: text });
      const { answer, results, structured_query } = response.data;

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'system',
          text: answer || 'Search complete.',
          timestamp: new Date().toISOString(),
          structured: structured_query,
          count: results?.length || 0,
          rawResults: results
        }
      ]);

      if (results && results.length > 0 && onResultsHighlight) {
        onResultsHighlight(results);
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'error',
          text: error.response?.data?.error || 'Failed to reach service.',
          timestamp: new Date().toISOString(),
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white/95 dark:bg-slate-900/95">
        <div className="flex items-center gap-3">
           <button 
              onClick={handleNewChat}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-indigo-600 border border-slate-200 dark:border-slate-700 shadow-sm"
              title="New Chat"
           >
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
           </button>
           <div>
             <h2 className="text-sm font-bold dark:text-white">Graph Assistant</h2>
             <span className="text-[10px] text-green-500 flex items-center gap-1 font-semibold">● Online</span>
           </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col max-w-[90%] ${msg.sender === 'user' ? 'ms-auto items-end' : 'me-auto items-start'}`}>
            <div className={`px-4 py-2.5 rounded-2xl text-sm ${
              msg.sender === 'user' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
            }`}>
              {msg.text}
              
              {msg.structured && (
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                   <details className="text-[10px] group">
                     <summary className="cursor-pointer text-indigo-500 font-bold hover:underline mb-2">Technical Details</summary>
                     <pre className="bg-slate-100 dark:bg-slate-950 p-2 rounded overflow-x-auto text-slate-600 dark:text-slate-400 max-h-40">
                       {JSON.stringify(msg.structured.query, null, 2)}
                     </pre>
                   </details>
                </div>
              )}
            </div>
            {msg.count > 0 && (
               <button 
                 onClick={() => reZoom(msg.rawResults)}
                 className="mt-1 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-[10px] text-indigo-600 dark:text-indigo-300 rounded-lg font-bold border border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all flex items-center gap-1.5 shadow-sm"
               >
                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>
                 Highlighted {msg.count} scattered nodes (Click to Zoom)
               </button>
            )}
          </div>
        ))}
        {isLoading && <div className="text-xs text-slate-400 animate-pulse bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg inline-block">Analyzing graph...</div>}
        
        {/* Suggestion Chips */}
        {messages.length === 1 && !isLoading && (
          <div className="pt-4">
            <p className="text-[10px] text-slate-400 uppercase font-bold mb-3 tracking-wider">Try these queries</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map(s => (
                <button 
                  key={s} 
                  onClick={() => handleSend(s)}
                  className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-800 rounded-full py-3 px-5 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white transition-all shadow-inner"
            placeholder="Search the graph..."
          />
          <button type="submit" className="absolute right-2 top-1.5 p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-md">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7-7 7M3 12h18"></path></svg>
          </button>
        </form>
      </div>
    </div>
  );
}
