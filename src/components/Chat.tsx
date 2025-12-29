'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { Send, Paperclip, Phone, Video, LogOut, User, Shield, Info, Download, Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, X, Bot, Sparkles, MessageSquare } from 'lucide-react';
import { encryptText, decryptText, encryptFile, decryptFile } from '@/lib/crypto';
import { motion, AnimatePresence } from 'framer-motion';
import gsap from 'gsap';

interface Message {
  id: string;
  text?: string;
  file?: {
    name: string;
    type: string;
    size: number;
    url: string;
  };
  sender: 'mine' | 'theirs' | 'sys';
  timestamp: Date;
}

interface ChatProps {
  socket: Socket;
  roomCode: string;
  aesKey: CryptoKey;
  onLogout: () => void;
  participants: number;
}

export default function Chat({ socket, roomCode, aesKey, onLogout, participants }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [partnerIsTyping, setPartnerIsTyping] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partnerIsTyping]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const setupWebRTC = async (isOffer: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice', { roomCode, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    if (isOffer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc-offer', { roomCode, sdp: offer });
    }

    return pc;
  };

  useEffect(() => {
    if (!socket) return;

    const handleOffer = async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      setInCall(true);
      const pc = await setupWebRTC(false);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      
      // Process any queued ICE candidates
      while (iceCandidatesQueue.current.length > 0) {
        const candidate = iceCandidatesQueue.current.shift();
        if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { roomCode, sdp: answer });
    };

    const handleAnswer = async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      if (pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        
        // Process any queued ICE candidates
        while (iceCandidatesQueue.current.length > 0) {
          const candidate = iceCandidatesQueue.current.shift();
          if (candidate) await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    };

    const handleIce = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      if (pcRef.current && pcRef.current.remoteDescription) {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        iceCandidatesQueue.current.push(candidate);
      }
    };

    const handleCallEnd = () => {
      endCall(false);
    };

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice', handleIce);
    socket.on('call-end', handleCallEnd);

    return () => {
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
      socket.off('webrtc-ice');
      socket.off('call-end');
    };
  }, [socket, roomCode]);

  const startCall = async () => {
    setInCall(true);
    await setupWebRTC(true);
  };

  const endCall = (emit = true) => {
    if (emit) socket.emit('call-end', { roomCode });
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidatesQueue.current = [];
    setLocalStream(null);
    setRemoteStream(null);
    setInCall(false);
  };

  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !micOn;
      });
      setMicOn(!micOn);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !videoOn;
      });
      setVideoOn(!videoOn);
    }
  };

  useEffect(() => {
    if (!socket) return;

    const handleMessage = async ({ ivB64, ciphertextB64 }: { ivB64: string; ciphertextB64: string }) => {
      try {
        const text = await decryptText(aesKey, ivB64, ciphertextB64);
        setMessages(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          text,
          sender: 'theirs',
          timestamp: new Date()
        }]);
      } catch (err) {
        console.error('Failed to decrypt message', err);
      }
    };

    const handleFile = async ({ ivB64, ciphertextB64, fileName, fileType, fileSize }: any) => {
      try {
        const file = await decryptFile(aesKey, ivB64, ciphertextB64, fileName, fileType);
        const url = URL.createObjectURL(file);
        setMessages(prev => [...prev, {
          id: Math.random().toString(36).substr(2, 9),
          file: { name: fileName, type: fileType, size: fileSize, url },
          sender: 'theirs',
          timestamp: new Date()
        }]);
      } catch (err) {
        console.error('Failed to decrypt file', err);
      }
    };

    const handleTyping = ({ isTyping }: { isTyping: boolean }) => {
      setPartnerIsTyping(isTyping);
    };

    socket.on('message', handleMessage);
    socket.on('file', handleFile);
    socket.on('typing', handleTyping);

    return () => {
      socket.off('message', handleMessage);
      socket.off('file', handleFile);
      socket.off('typing', handleTyping);
    };
  }, [socket, aesKey]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !socket) return;

    const text = inputValue.trim();
    setInputValue('');
    
    try {
      const { ivB64, ciphertextB64 } = await encryptText(aesKey, text);
      socket.emit('message', { roomCode, ivB64, ciphertextB64 });
      
      setMessages(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        text,
        sender: 'mine',
        timestamp: new Date()
      }]);
    } catch (err) {
      console.error('Encryption failed', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    try {
      const { ivB64, ciphertextB64, fileName, fileType, fileSize } = await encryptFile(aesKey, file);
      socket.emit('file', { roomCode, ivB64, ciphertextB64, fileName, fileType, fileSize });
      
      const url = URL.createObjectURL(file);
      setMessages(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        file: { name: fileName, type: fileType, size: fileSize, url },
        sender: 'mine',
        timestamp: new Date()
      }]);
    } catch (err) {
      console.error('File encryption failed', err);
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing', { roomCode, isTyping: true });
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing', { roomCode, isTyping: false });
    }, 2000);
  };

  const handleAIQuery = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!aiQuery.trim() && !aiResponse) {
      // If empty and no previous response, do a general summary
      processAI('Give me a general summary of the chat.');
    } else if (aiQuery.trim()) {
      processAI(aiQuery);
    }
  };

  const processAI = async (query: string) => {
    setIsThinking(true);
    setAiResponse(null);
    
    try {
      const chatMessages = messages.filter(m => m.text || m.file);
      
      if (chatMessages.length === 0) {
        setAiResponse("The chat is empty! Start talking and I'll be able to analyze it for you. ✨");
        setIsThinking(false);
        return;
      }

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: chatMessages,
          query: query,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setAiResponse(`❌ **Error**: ${data.error}`);
      } else {
        setAiResponse(data.response);
      }
    } catch (error) {
      console.error('AI Processing Error:', error);
      setAiResponse("❌ Sorry, I encountered an error while processing your request. Please try again later.");
    } finally {
      setIsThinking(false);
      setAiQuery('');
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-2xl bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-bottom border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Shield className="text-white w-5 h-5" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              Secure Room: <span className="text-blue-400 font-mono">{roomCode}</span>
            </h2>
            <p className="text-slate-400 text-xs flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              {participants} users online
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              setShowAI(true);
              if (!aiResponse) processAI('summary');
            }}
            className="p-2 text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 bg-blue-500/10 rounded-lg border border-blue-500/20"
            title="AI Chat Summary"
          >
            <Bot size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">AI Bot</span>
          </button>
          <button 
            onClick={startCall}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <Phone size={20} />
          </button>
          <button 
            onClick={startCall}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            <Video size={20} />
          </button>
          <button 
            onClick={onLogout}
            className="p-2 text-red-400 hover:text-red-300 transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Video Call Overlay */}
      <AnimatePresence>
        {inCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-xl flex flex-col p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                  <VideoIcon className="text-white w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Secure Video Call</h3>
                  <p className="text-slate-400 text-xs">End-to-end encrypted</p>
                </div>
              </div>
              <button 
                onClick={() => endCall(true)}
                className="p-2 text-slate-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
                <video 
                  ref={localVideoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 backdrop-blur-md rounded-lg text-white text-xs">
                  You
                </div>
              </div>
              <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
                {remoteStream ? (
                  <video 
                    ref={remoteVideoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 animate-pulse">
                      <User className="text-slate-500 w-8 h-8" />
                    </div>
                    <p className="text-slate-500 text-sm">Waiting for partner...</p>
                  </div>
                )}
                <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 backdrop-blur-md rounded-lg text-white text-xs">
                  Partner
                </div>
              </div>
            </div>

            <div className="flex justify-center items-center gap-6 mt-8">
              <button 
                onClick={toggleMic}
                className={`p-4 rounded-full transition-all ${micOn ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-500 text-white hover:bg-red-600'}`}
              >
                {micOn ? <Mic size={24} /> : <MicOff size={24} />}
              </button>
              <button 
                onClick={() => endCall(true)}
                className="p-5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-all shadow-xl shadow-red-600/20"
              >
                <PhoneOff size={32} />
              </button>
              <button 
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-all ${videoOn ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-500 text-white hover:bg-red-600'}`}
              >
                {videoOn ? <VideoIcon size={24} /> : <VideoOff size={24} />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Assistant Overlay */}
      <AnimatePresence>
        {showAI && (
          <motion.div
            initial={{ opacity: 0, x: 320 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 320 }}
            className="absolute inset-y-0 right-0 w-80 bg-slate-900/98 backdrop-blur-3xl border-l border-slate-700/50 z-40 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.5)] flex flex-col"
          >
            {/* AI Header */}
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between bg-gradient-to-r from-blue-600/10 to-transparent">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                    <Bot className="text-white w-5 h-5" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-slate-900 rounded-full"></div>
                </div>
                <div>
                  <h3 className="text-white text-sm font-bold tracking-tight">LockChat AI</h3>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></div>
                    <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Online & Secure</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setShowAI(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* AI Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
              {isThinking ? (
                <div className="flex flex-col items-center justify-center h-full space-y-5">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-blue-500/10 border-t-blue-500 rounded-full animate-spin"></div>
                    <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-blue-400 w-6 h-6 animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-slate-200 text-sm font-medium">Analyzing Chat History</p>
                    <p className="text-slate-500 text-xs mt-1">Decrypting and processing context...</p>
                  </div>
                </div>
              ) : aiResponse ? (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-5"
                >
                  <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 relative group overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50"></div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-blue-400">
                        <MessageSquare size={16} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Analysis Report</span>
                      </div>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(aiResponse);
                          // Could add a toast here
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-400 transition-colors"
                        title="Copy to clipboard"
                      >
                        <Download size={14} />
                      </button>
                    </div>
                    <div className="prose prose-invert prose-xs max-w-none">
                      <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-medium">
                        {aiResponse}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Quick Actions</p>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { icon: <Bot size={14}/>, label: 'Get Latest Summary', query: 'summarize' },
                        { icon: <Shield size={14}/>, label: 'Security Check', query: 'who is here' },
                        { icon: <Sparkles size={14}/>, label: 'What can you do?', query: 'help' }
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => processAI(item.query)}
                          className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-slate-700/30 hover:border-blue-500/30 hover:bg-blue-500/5 text-slate-400 hover:text-blue-300 transition-all text-left group"
                        >
                          <span className="text-slate-500 group-hover:text-blue-400 transition-colors">{item.icon}</span>
                          <span className="text-xs font-semibold">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-6">
                  <div className="w-20 h-20 rounded-3xl bg-slate-800/50 flex items-center justify-center border border-slate-700/50 shadow-inner">
                    <Bot className="text-slate-600 w-10 h-10" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-lg">Hello! I'm Locky</h4>
                    <p className="text-slate-500 text-sm mt-2 leading-relaxed">
                      I can help you summarize your encrypted conversations or find specific information instantly.
                    </p>
                  </div>
                  <button
                    onClick={() => processAI('summarize')}
                    className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                  >
                    Generate First Summary
                  </button>
                </div>
              )}
            </div>

            {/* AI Input */}
            <div className="p-5 border-t border-slate-700/50 bg-slate-900/50">
              <form onSubmit={handleAIQuery} className="relative group">
                <input 
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  placeholder="Ask Locky anything..."
                  className="w-full bg-slate-800/50 border border-slate-700/50 text-white text-xs rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all placeholder:text-slate-600 font-medium"
                />
                <button 
                  type="submit"
                  disabled={isThinking || !aiQuery.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 text-white rounded-lg transition-all shadow-md shadow-blue-600/10 active:scale-90"
                >
                  <Send size={14} />
                </button>
              </form>
              <p className="text-[9px] text-slate-600 text-center mt-3 font-medium">
                AI can make mistakes. Verify important info.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700">
        <div className="flex justify-center">
          <div className="bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700 text-[10px] text-slate-400 flex items-center gap-1">
            <Shield size={12} /> Messages are end-to-end encrypted
          </div>
        </div>

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex ${msg.sender === 'mine' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] rounded-2xl p-3 shadow-sm ${
                msg.sender === 'mine' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
              }`}>
                {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
                
                {msg.file && (
                  <div className="space-y-2">
                    {msg.file.type.startsWith('image/') ? (
                      <div className="group relative">
                        <img src={msg.file.url} alt={msg.file.name} className="rounded-lg max-w-full h-auto border border-white/10" />
                        <a 
                          href={msg.file.url} 
                          download={msg.file.name}
                          className="absolute top-2 right-2 p-2 bg-black/50 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Download size={16} />
                        </a>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 bg-black/20 p-2 rounded-lg">
                        <Paperclip size={18} className="text-blue-300" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{msg.file.name}</p>
                          <p className="text-[10px] opacity-60">{(msg.file.size / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                        <a href={msg.file.url} download={msg.file.name} className="p-1 hover:bg-white/10 rounded text-blue-400">
                          <Download size={16} />
                        </a>
                      </div>
                    )}
                  </div>
                )}
                
                <span className={`text-[9px] block mt-1 opacity-50 ${msg.sender === 'mine' ? 'text-right' : 'text-left'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {partnerIsTyping && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="bg-slate-800 border border-slate-700 text-slate-400 rounded-2xl rounded-tl-none p-2 px-3 text-xs flex items-center gap-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
              Partner is typing
            </div>
          </motion.div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-slate-800/50 border-t border-slate-700">
        <form onSubmit={handleSendMessage} className="flex items-end gap-2">
          <button 
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl transition-colors"
          >
            <Paperclip size={20} />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          
          <div className="flex-1 relative">
            <textarea
              value={inputValue}
              onChange={handleTyping}
              placeholder="Type an encrypted message..."
              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none max-h-32 text-sm"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
          </div>
          
          <button 
            type="submit"
            disabled={!inputValue.trim()}
            className="p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl transition-all shadow-lg shadow-blue-500/20"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}
