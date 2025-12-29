'use client';

import React, { useState, useEffect } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { randomCode, genSaltB64, deriveAesKeyFromCode } from '@/lib/crypto';
import ThreeBackground from '@/components/ThreeBackground';
import Chat from '@/components/Chat';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, Key, ArrowRight, Plus, Users, Sparkles, Linkedin, Mail } from 'lucide-react';

export default function Home() {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001';
  const { socket, isConnected } = useSocket(socketUrl);
  const [step, setStep] = useState<'landing' | 'joining' | 'chat'>('landing');
  const [roomCode, setRoomCode] = useState('');
  const [aesKey, setAesKey] = useState<CryptoKey | null>(null);
  const [participants, setParticipants] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!socket) return;

    socket.on('presence', ({ count }: { count: number }) => {
      setParticipants(count);
    });

    return () => {
      socket.off('presence');
    };
  }, [socket]);

  const handleCreateRoom = async () => {
    if (!socket) return;
    const code = randomCode();
    const salt = genSaltB64();
    
    socket.emit('create-room', { code, salt }, async (res: any) => {
      if (res.ok) {
        const key = await deriveAesKeyFromCode(code, salt);
        setRoomCode(code);
        setAesKey(key);
        setStep('chat');
      } else {
        setError(res.error || 'Failed to create room');
      }
    });
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !roomCode) return;

    socket.emit('join-room', { code: roomCode.toUpperCase() }, async (res: any) => {
      if (res.ok) {
        const key = await deriveAesKeyFromCode(roomCode.toUpperCase(), res.salt);
        setAesKey(key);
        setStep('chat');
      } else {
        setError(res.error || 'Room not found');
      }
    });
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <ThreeBackground />
      
      <div className="z-10 w-full max-w-4xl flex flex-col items-center">
        <AnimatePresence mode="wait">
          {step === 'landing' && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="text-center space-y-8"
            >
              <div className="space-y-4">
                <motion.div 
                  initial={{ y: -20 }}
                  animate={{ y: 0 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium"
                >
                  <Shield size={16} />
                  <span>Military-grade Encryption</span>
                </motion.div>
                
                <h1 className="text-6xl md:text-8xl font-bold text-white tracking-tight">
                  LOCK<span className="text-blue-500">CHAT</span>
                </h1>
                <p className="text-slate-400 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
                  The world's most secure, ephemeral, and private chatting application. 
                  No data stored. No traces left behind.
                </p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
                <button
                  onClick={handleCreateRoom}
                  className="group relative px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-semibold transition-all shadow-xl shadow-blue-600/20 flex items-center gap-2 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                  <Plus size={20} />
                  <span>Create Secure Room</span>
                </button>
                
                <button
                  onClick={() => setStep('joining')}
                  className="px-8 py-4 bg-slate-800/50 hover:bg-slate-800 text-white rounded-2xl font-semibold border border-slate-700 transition-all backdrop-blur-md flex items-center gap-2"
                >
                  <Users size={20} />
                  <span>Join Existing Room</span>
                </button>
              </div>

              <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                {[
                  { icon: <Lock className="text-blue-400" />, title: "End-to-End", desc: "Keys never leave your browser" },
                  { icon: <Sparkles className="text-purple-400" />, title: "Zero Trace", desc: "Messages exist only in RAM" },
                  { icon: <Shield className="text-green-400" />, title: "Open Source", desc: "Peer-reviewed security protocols" }
                ].map((feature, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 backdrop-blur-sm"
                  >
                    <div className="mb-2">{feature.icon}</div>
                    <h3 className="text-white font-medium">{feature.title}</h3>
                    <p className="text-slate-500 text-xs">{feature.desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'joining' && (
            <motion.div
              key="joining"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl p-8 rounded-3xl border border-slate-700 shadow-2xl"
            >
              <div className="mb-8">
                <button 
                  onClick={() => setStep('landing')}
                  className="text-slate-400 hover:text-white text-sm mb-4 transition-colors"
                >
                  ← Back to home
                </button>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Key className="text-blue-500" /> Enter Room Code
                </h2>
                <p className="text-slate-400 text-sm mt-2">
                  Please provide the secret code shared by your partner.
                </p>
              </div>

              <form onSubmit={handleJoinRoom} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Room Code</label>
                  <input
                    type="text"
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="E.G. XJ72KB91"
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-4 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-xl font-mono tracking-widest text-center"
                    autoFocus
                  />
                  {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
                </div>

                <button
                  type="submit"
                  disabled={!roomCode || !isConnected}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  <span>Connect Securely</span>
                  <ArrowRight size={20} />
                </button>
              </form>
            </motion.div>
          )}

          {step === 'chat' && aesKey && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex justify-center"
            >
              <Chat 
                socket={socket!} 
                roomCode={roomCode} 
                aesKey={aesKey} 
                participants={participants}
                onLogout={() => {
                  setStep('landing');
                  setAesKey(null);
                  setRoomCode('');
                }} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 text-slate-500 text-[10px] uppercase tracking-[0.2em] font-medium opacity-50">
        @ all right are reserved to the AKSHAY SAITWAL
      </div>

      {/* Developer Contact Section */}
      <div className="fixed bottom-4 left-4 flex flex-col gap-2 z-20">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/80 border border-slate-700 backdrop-blur-md shadow-xl"
        >
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Developer</span>
            <span className="text-xs text-white font-medium">Akshay Saitwal</span>
          </div>
          <div className="flex gap-2 border-l border-slate-700 pl-3">
            <a 
              href="https://www.linkedin.com/in/akshay-saitwal-462bb4286/"
              target="_blank" 
              rel="noopener noreferrer"
              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-all"
              title="LinkedIn Profile"
            >
              <Linkedin size={16} />
            </a>
            <a 
              href="mailto:akshaysaitwal9@gmail.com" 
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
              title="Email Me"
            >
              <Mail size={16} />
            </a>
          </div>
        </motion.div>
      </div>
      
      {/* Connection Status Indicator */}
      <div className="fixed bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-700 backdrop-blur-sm">
        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-[10px] font-medium text-slate-300 uppercase tracking-wider">
          {isConnected ? 'Server Online' : 'Connecting...'}
        </span>
      </div>
    </main>
  );
}
