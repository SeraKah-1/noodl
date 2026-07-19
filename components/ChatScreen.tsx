import { t } from '../services/i18n';
import { PageHeader } from './PageHeader';
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, ArrowLeft, FolderInput } from 'lucide-react';
import { chatWithDocument } from '../services/geminiService';
import { getApiKey } from '../services/storageService';
import { showErrorNotification } from '../services/errorNotificationService';
import { getLocale } from '../services/i18n';

interface ChatScreenProps {
  contextText: string;
  sourceFile: File | null;
  /** Display name for the active study pack (quiz title / file) */
  sourceLabel?: string;
  onClose: () => void;
  /** Return to pack picker without leaving the tool route */
  onChangeSource?: () => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  contextText,
  sourceFile,
  sourceLabel,
  onClose,
  onChangeSource,
}) => {
  const isId = getLocale() === 'id';
  const sourceName =
    sourceLabel ||
    (sourceFile ? sourceFile.name : t('chatHelloTopic'));
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    { role: 'model', text: t('chatHello').replace('{source}', sourceName) },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    const { getActiveProvider, getActiveModel, getCachedModels } = await import('../services/providerService');
    const provider = getActiveProvider();
    const apiKey = getApiKey(provider);
    const models = getCachedModels(provider);
    const modelId =
      getActiveModel(provider) ||
      models[0]?.id ||
      (provider === 'gemini' ? 'gemini-2.0-flash' : '');
    
    // Convert simplified messages to API history format
    const apiHistory = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    try {
      if (!apiKey && provider !== 'gemini') {
        throw new Error('API key missing for active provider. Set it in Settings.');
      }
      
      const response = await chatWithDocument(
        apiKey || '',
        modelId,
        apiHistory,
        userMsg,
        contextText,
        sourceFile
      );

      setMessages(prev => [...prev, { role: 'model', text: response }]);
    } catch (e: any) {
      showErrorNotification({
        title: t('chatFailed'),
        action: "ChatScreen.handleSend",
        whatHappened: t('chatWhatHappened'),
        error: e
      });
      setMessages(prev => [...prev, { role: 'model', text: 'Sorry — chat failed. Try again in a moment.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-xl flex flex-col md:max-w-md md:right-0 md:left-auto md:border-l border-slate-200 shadow-2xl">
       {/* Header */}
       <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2 bg-white/50">
         <div className="flex items-center space-x-3 min-w-0">
            <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full shrink-0" aria-label={t('back')}>
              <ArrowLeft size={20} className="text-slate-500" />
            </button>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-800 flex items-center">
                <Bot size={18} className="mr-2 text-indigo-500 shrink-0" /> Assistant
              </h2>
              <p className="text-xs text-slate-500 truncate max-w-[180px]" title={sourceName}>
                {sourceName}
              </p>
            </div>
         </div>
         {onChangeSource && (
           <button
             type="button"
             onClick={onChangeSource}
             className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 hover:bg-indigo-100"
           >
             <FolderInput size={14} />
             {isId ? 'Ganti sumber' : 'Change source'}
           </button>
         )}
       </div>

       {/* Chat Area */}
       <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
         {messages.map((msg, idx) => (
           <motion.div 
             key={idx}
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
           >
             <div className={`
               max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed
               ${msg.role === 'user' 
                 ? 'bg-indigo-600 text-white rounded-br-none' 
                 : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}
             `}>
               {msg.text}
             </div>
           </motion.div>
         ))}
         {loading && (
           <div className="flex justify-start">
             <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-bl-none shadow-sm flex space-x-1">
               <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" />
               <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75" />
               <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150" />
             </div>
           </div>
         )}
         <div ref={scrollRef} />
       </div>

       {/* Input Area */}
       <div className="p-4 bg-white border-t border-slate-100">
         <div className="relative">
           <input 
             type="text" 
             value={input}
             onChange={(e) => setInput(e.target.value)}
             onKeyDown={(e) => e.key === 'Enter' && handleSend()}
             placeholder="Ask about the material…"
             className="w-full bg-slate-100 border-none rounded-full px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none"
           />
           <button 
             onClick={handleSend}
             disabled={loading || !input.trim()}
             className="absolute right-2 top-2 p-1.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 transition-colors"
           >
             <Send size={16} />
           </button>
         </div>
       </div>
    </div>
  );
};
