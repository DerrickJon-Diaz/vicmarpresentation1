import React, { useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { AlertCircle, MessageCircle, MoreHorizontal, SendHorizontal } from "lucide-react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import {
  appendAdminMessage,
  endSupportSession,
  setConversationStatus,
  subscribeToSupportSessions,
} from "@/lib/supportChatService";

const ADMIN_AGENT_NAME_KEY = "vicmar_admin_agent_name";

export default function AdminMessages() {
  const [syncError, setSyncError] = useState("");
  const [isAdminSessionReady, setIsAdminSessionReady] = useState(false);
  const [supportSessions, setSupportSessions] = useState([]);
  const [activeSupportSessionId, setActiveSupportSessionId] = useState("");
  const [adminReply, setAdminReply] = useState("");
  const [adminAgentName, setAdminAgentName] = useState(() => {
    const storedName = localStorage.getItem(ADMIN_AGENT_NAME_KEY);
    return storedName ? storedName.trim() : "Admin";
  });
  
  // Pagination State for Chat Support
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const supportMessagesRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdminSessionReady(Boolean(user && !user.isAnonymous));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAdminSessionReady) return undefined;

    const unsubscribe = subscribeToSupportSessions(
      (nextSessions) => {
        const queue = nextSessions.filter((session) => session.liveAgentRequested);
        setSupportSessions(queue);

        setActiveSupportSessionId((currentId) => {
          if (currentId && queue.some((session) => session.id === currentId)) {
            return currentId;
          }
          return queue[0]?.id ?? "";
        });
      },
      (error) => {
        console.error(error);
        setSyncError("Unable to sync live agent chat right now.");
      },
      { allowAnonymous: false },
    );

    return unsubscribe;
  }, [isAdminSessionReady]);

  const supportSummary = useMemo(() => {
    const result = {
      totalRequests: supportSessions.length,
      waiting: 0,
      active: 0,
      closed: 0,
    };

    supportSessions.forEach((session) => {
      if (session.status === "awaiting-agent") result.waiting += 1;
      else if (session.status === "agent-connected") result.active += 1;
      else if (session.status === "closed") result.closed += 1;
    });

    return result;
  }, [supportSessions]);

  const activeSupportSession = useMemo(
    () => supportSessions.find((session) => session.id === activeSupportSessionId) ?? null,
    [supportSessions, activeSupportSessionId],
  );

  useEffect(() => {
    if (!supportMessagesRef.current) return;
    supportMessagesRef.current.scrollTop = supportMessagesRef.current.scrollHeight;
  }, [activeSupportSessionId, activeSupportSession?.messages?.length]);

  useEffect(() => {
    const normalizedName = adminAgentName.trim() || "Admin";
    localStorage.setItem(ADMIN_AGENT_NAME_KEY, normalizedName);
  }, [adminAgentName]);

  const adminDisplayName = useMemo(() => adminAgentName.trim() || "Admin", [adminAgentName]);

  const quickReplyTemplates = useMemo(() => {
    return [
      {
        label: "Intro",
        text: `Hello, I am ${adminDisplayName} from Vicmar Homes. How can I help you today?`,
      },
      {
        label: "Ask Details",
        text: "Thank you for contacting us. May I get your preferred property type and budget so I can assist you better?",
      },
      {
        label: "Schedule",
        text: "We can schedule your site visit. Please share your preferred date and time.",
      },
      {
        label: "Closing",
        text: "Thank you for your time. If you need more help, just send us a message anytime.",
      },
    ];
  }, [adminDisplayName]);

  const handleUseQuickReply = (text) => setAdminReply(text);

  const handleSendAdminReply = (event) => {
    event.preventDefault();
    const nextReply = adminReply.trim();
    if (!nextReply || !activeSupportSessionId) return;

    appendAdminMessage(activeSupportSessionId, nextReply, adminDisplayName);
    setAdminReply("");
  };

  const handleConnectToLiveChat = () => {
    if (!activeSupportSessionId) return;
    setConversationStatus(activeSupportSessionId, "agent-connected");
  };

  const handleCloseConversation = async () => {
    if (!activeSupportSessionId) return;
    await endSupportSession(activeSupportSessionId);
  };

  const getSessionStatusClassName = (status) => {
    if (status === "awaiting-agent") return "bg-amber-100 text-amber-700";
    if (status === "agent-connected") return "bg-emerald-100 text-emerald-700";
    if (status === "closed") return "bg-slate-200 text-slate-700";
    return "bg-slate-100 text-slate-600";
  };

  const getSessionStatusLabel = (status) => {
    if (status === "awaiting-agent") return "Waiting";
    if (status === "agent-connected") return "Live";
    if (status === "closed") return "Closed";
    return "Bot";
  };

  // Pagination Logic
  const totalPages = Math.ceil(supportSessions.length / itemsPerPage);
  const currentSessions = supportSessions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="space-y-6">
        {syncError && (
          <div className="flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3.5 shadow-sm">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-500" />
            <span className="font-medium">{syncError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5">
           {/* Live Agent Requests Section */}
           <section className="bg-white/60 backdrop-blur-xl border border-white/60 rounded-3xl shadow-[0_4px_24px_rgb(0,0,0,0.04)] flex flex-col overflow-hidden h-[80vh] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-all duration-400">
             {/* Header */}
             <div className="px-6 py-4 border-b border-white/40 flex items-center justify-between bg-white/40">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-xl bg-[#15803d]/10 flex items-center justify-center border border-[#15803d]/20">
                   <MessageCircle className="w-5 h-5 text-[#15803d]" />
                 </div>
                 <div>
                   <h2 className="text-base font-bold text-slate-900">Live Agent Console</h2>
                   <p className="text-xs text-slate-500 font-medium">Respond to live customer inquiries and manage active queues</p>
                 </div>
               </div>
               <div className="flex items-center gap-2">
                 <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full shadow-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">{supportSummary.active} Active</span>
                 </div>
                 <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                 </button>
               </div>
             </div>

             {/* Grid Layout for Channels vs Chat Canvas */}
             <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
                
                {/* Channels/Sessions List */}
                <div className="w-full lg:w-[320px] border-r border-white/50 flex flex-col bg-white/30 backdrop-blur-md">
                   <div className="p-4 border-b border-white/40">
                      <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                         <span>Inbox Queue</span>
                         <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{supportSummary.waiting} Waiting</span>
                      </div>
                   </div>
                   <div className="flex-1 overflow-y-auto w-full p-3 space-y-2">
                      {supportSessions.length === 0 ? (
                         <div className="h-full flex flex-col items-center justify-center p-6 text-center">
                            <MessageCircle className="w-8 h-8 text-slate-300 mb-2" />
                            <p className="text-sm font-medium text-slate-500">No active requests.</p>
                         </div>
                      ) : (
                         currentSessions.map((session) => {
                           const isSelected = session.id === activeSupportSessionId;
                           const lastMessage = session.messages?.[session.messages.length - 1];

                           return (
                             <button
                               key={session.id}
                               onClick={() => setActiveSupportSessionId(session.id)}
                               className={`w-full text-left rounded-2xl p-3.5 transition-all outline-none focus:ring-2 focus:ring-[#15803d]/30 ${
                                 isSelected
                                   ? "bg-white/90 border border-[#15803d]/30 shadow-sm relative before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1.5 before:bg-[#15803d] before:rounded-r-full"
                                   : "bg-transparent border border-transparent hover:bg-white/50"
                               }`}
                             >
                               <div className="flex items-center justify-between mb-1.5">
                                 <p className={`text-[13.5px] font-bold truncate pr-2 ${isSelected ? "text-slate-900" : "text-slate-700"}`}>
                                    {session.visitorLabel}
                                 </p>
                                 <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${getSessionStatusClassName(session.status)}`}>
                                   {getSessionStatusLabel(session.status)}
                                 </span>
                               </div>
                               <p className="text-xs text-slate-500 line-clamp-1">{lastMessage?.text ?? "Started chat..."}</p>
                             </button>
                           );
                         })
                      )}
                   </div>
                   {/* Pagination Controls */}
                   {totalPages > 1 && (
                      <div className="p-3 border-t border-white/40 flex items-center justify-between bg-white/40 text-[11px] text-slate-600 font-bold uppercase tracking-wider">
                         <button 
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition-colors bg-white/50"
                         >
                            Prev
                         </button>
                         <span>Page {currentPage} of {totalPages}</span>
                         <button 
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition-colors bg-white/50"
                         >
                            Next
                         </button>
                      </div>
                   )}
                </div>

                {/* Chat Canvas Section */}
                <div className="flex-1 flex flex-col bg-slate-50/50">
                   {activeSupportSession ? (
                      <>
                         {/* Chat Header */}
                         <div className="px-6 py-4 border-b border-slate-200/60 flex items-center justify-between bg-white/80 backdrop-blur-xl z-10 w-full shadow-sm">
                            <div className="flex items-center gap-3">
                               <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#15803d]/20 to-emerald-400/20 text-[#15803d] flex items-center justify-center font-black text-sm uppercase border border-[#15803d]/20 shadow-inner">
                                  {activeSupportSession.visitorLabel?.[0] || 'U'}
                               </div>
                               <div>
                                  <p className="text-[15px] font-bold text-slate-900">{activeSupportSession.visitorLabel}</p>
                                  <p className="text-[11px] text-slate-500 font-medium tracking-wide">Session ID: {activeSupportSession.id.slice(-8).toUpperCase()}</p>
                               </div>
                            </div>
                            <div className="flex items-center gap-2">
                               <button
                                  onClick={handleConnectToLiveChat}
                                  disabled={activeSupportSession.status === "agent-connected"}
                                  className="text-[11px] uppercase tracking-wider font-bold rounded-xl px-4 py-2.5 bg-[#15803d] text-white hover:bg-[#166534] disabled:opacity-50 shadow-sm transition-all active:scale-[0.98]"
                               >
                                  {activeSupportSession.status === "agent-connected" ? "Live Connected" : "Accept Session"}
                               </button>
                               <AlertDialog.Root>
                                  <AlertDialog.Trigger asChild>
                                     <button
                                        disabled={activeSupportSession.status === "closed"}
                                        className="text-[11px] uppercase tracking-wider font-bold rounded-xl px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-all active:scale-[0.98]"
                                     >
                                        Close Chat
                                     </button>
                                  </AlertDialog.Trigger>
                                  <AlertDialog.Portal>
                                     <AlertDialog.Overlay className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 animate-in fade-in" />
                                     <AlertDialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-200 bg-white p-6 shadow-lg sm:rounded-3xl animate-in fade-in zoom-in-95">
                                        <div className="flex flex-col space-y-2 text-center sm:text-left">
                                           <AlertDialog.Title className="text-lg font-bold text-slate-900">
                                              Close Support Session
                                           </AlertDialog.Title>
                                           <AlertDialog.Description className="text-sm text-slate-500">
                                              Are you sure you want to close this chat with <strong>{activeSupportSession.visitorLabel}</strong>? The user will be notified that the session has ended.
                                           </AlertDialog.Description>
                                        </div>
                                        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4">
                                           <AlertDialog.Cancel asChild>
                                              <button className="mt-2 sm:mt-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
                                                 Cancel
                                              </button>
                                           </AlertDialog.Cancel>
                                           <AlertDialog.Action asChild>
                                              <button 
                                                 onClick={async () => {
                                                    await handleCloseConversation();
                                                    toast.success("Support session closed successfully.");
                                                 }}
                                                 className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                                              >
                                                 Close Session
                                              </button>
                                           </AlertDialog.Action>
                                        </div>
                                     </AlertDialog.Content>
                                  </AlertDialog.Portal>
                               </AlertDialog.Root>
                            </div>
                         </div>

                         {/* Chat Messages */}
                         <div ref={supportMessagesRef} className="flex-1 p-6 overflow-y-auto bg-transparent space-y-5">
                            {(activeSupportSession.messages ?? []).map((message) => {
                               const isAdmin = message.sender === "admin";
                               const isUser = message.sender === "user";
                               const bubbleClassName = isAdmin
                               ? "bg-gradient-to-br from-[#15803d] to-emerald-600 text-white rounded-br-sm shadow-md"
                               : isUser
                                  ? "bg-white text-slate-800 border border-slate-100 rounded-bl-sm shadow-md"
                                  : "bg-amber-100 text-amber-900 rounded-bl-sm shadow-sm";

                               return (
                               <div key={message.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                                  <div className={`max-w-[75%] lg:max-w-[60%] rounded-[20px] px-5 py-3.5 text-[14px] font-medium leading-relaxed ${bubbleClassName} flex flex-col`}>
                                     {isAdmin ? <p className="text-[10px] font-bold text-emerald-200 mb-1 tracking-wider uppercase">{message.adminName ?? "Admin"}</p> : null}
                                     <p>{message.text}</p>
                                  </div>
                               </div>
                               );
                            })}
                         </div>

                         {/* Chat Input & Quick Replies */}
                         <div className="p-5 border-t border-slate-200/60 bg-white/80 backdrop-blur-xl flex flex-col gap-3">
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
                               {quickReplyTemplates.map((template) => (
                                  <button
                                     key={template.label}
                                     onClick={() => handleUseQuickReply(template.text)}
                                     className="flex-shrink-0 text-[11px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm"
                                  >
                                     {template.label}
                                  </button>
                               ))}
                            </div>

                            <form onSubmit={handleSendAdminReply} className="flex gap-3 relative">
                               <div className="flex-1 bg-white border border-slate-200 rounded-2xl focus-within:ring-2 focus-within:ring-[#15803d]/30 focus-within:border-[#15803d]/50 transition-all p-3 flex flex-col shadow-sm">
                                  <input
                                     type="text"
                                     value={adminReply}
                                     onChange={(e) => setAdminReply(e.target.value)}
                                     placeholder="Type your reply here..."
                                     className="w-full bg-transparent text-[15px] focus:outline-none mb-3 font-medium placeholder:text-slate-400"
                                  />
                                  <div className="flex items-center justify-between mt-auto px-1 border-t border-slate-100 pt-2">
                                     <div className="flex items-center gap-2">
                                        <label htmlFor="agent-name" className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Sending As:</label>
                                        <input
                                           id="agent-name"
                                           type="text"
                                           value={adminAgentName}
                                           onChange={(e) => setAdminAgentName(e.target.value)}
                                           className="w-24 bg-transparent border-b border-transparent hover:border-slate-200 text-xs font-bold text-slate-600 focus:outline-none focus:border-[#15803d] transition-colors px-1"
                                        />
                                     </div>
                                  </div>
                               </div>
                               <button
                                  type="submit"
                                  disabled={!adminReply.trim() || !activeSupportSessionId}
                                  className="self-end w-14 h-14 bg-[#15803d] text-white rounded-2xl flex items-center justify-center hover:bg-[#166534] disabled:opacity-50 disabled:hover:bg-[#15803d] shadow-lg shadow-green-900/10 transition-all active:scale-95 flex-shrink-0"
                               >
                                  <SendHorizontal className="w-6 h-6 ml-0.5" />
                               </button>
                            </form>
                         </div>
                      </>
                   ) : (
                      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center text-slate-400">
                         <MessageCircle className="w-16 h-16 mb-4 text-slate-200" />
                         <h3 className="text-xl font-bold text-slate-800 mb-2">Select a Conversation</h3>
                         <p className="max-w-xs text-sm font-medium">Choose an active support session from the queue sidebar to start helping customers.</p>
                      </div>
                   )}
                </div>
             </div>
           </section>
        </div>
    </div>
  );
}
