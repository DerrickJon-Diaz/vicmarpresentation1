import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { Menu, X, Phone, Mail, MapPin, Facebook, Instagram, Youtube, ChevronDown, HelpCircle, ChevronUp, MessageCircle, SendHorizontal } from "lucide-react";
import vicmarLogo from "@/images/logos/transparent-vicmar-logo.png";
import vicmarLogoFooter from "@/images/logos/vicmar-logo-footer.png";
import {
  appendBotMessage,
  appendUserMessage,
  createSupportSession,
  endSupportSession,
  getOrCreateActiveSupportSession,
  requestLiveAgent,
  subscribeToSupportSessions,
} from "@/lib/supportChatService";

const FAQ_ITEMS = [
  {
    question: "What payment methods are available?",
    answer: "We offer flexible payment options including bank financing, Pag-IBIG financing, in-house financing, and spot cash payments with discounts. Our sales team can help you find the best payment plan that suits your budget."
  },
  {
    question: "What amenities are included in the community?",
    answer: "Vicmar Homes features communal greenways with food gardens, vermicompost areas, playgrounds, and open spaces. Each home includes garden space for food and herb production, with options for vertical gardens, aquaponics, and rainwater tanks."
  },
  {
    question: "How does the purchase process work?",
    answer: "The process starts with a site visit and property selection. After choosing your home, you'll complete the reservation with a minimal fee, submit requirements for financing, and upon approval, sign the contract to sell. Our team guides you through every step."
  },
  {
    question: "Are there maintenance fees?",
    answer: "Yes, there are association dues for the upkeep of common areas including the greenways, communal gardens, and shared facilities. These fees ensure the sustainable features of the community are properly maintained for all residents."
  },
];

const BOT_FALLBACK_ANSWER = "Thanks for your question. I can help with payment options, amenities, purchase process, and fees. If you need more help, tap Request live agent.";

function getBotReply(question) {
  const normalizedQuestion = String(question ?? "").trim().toLowerCase();

  if (!normalizedQuestion) {
    return BOT_FALLBACK_ANSWER;
  }

  const matchedItem = FAQ_ITEMS.find((item) => {
    const normalizedPrompt = item.question.toLowerCase();
    return normalizedPrompt.includes(normalizedQuestion) || normalizedQuestion.includes(normalizedPrompt);
  });

  return matchedItem?.answer ?? BOT_FALLBACK_ANSWER;
}

export default function Layout({ children, currentPageName }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [activeChatId, setActiveChatId] = useState("");
  const [chatSession, setChatSession] = useState(null);
  const faqPanelRef = useRef(null);
  const faqBtnRef = useRef(null);
  const chatMessagesRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        faqPanelRef.current && !faqPanelRef.current.contains(e.target) &&
        faqBtnRef.current && !faqBtnRef.current.contains(e.target)
      ) {
        setFaqOpen(false);
      }
    };
    if (faqOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [faqOpen]);

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      const session = await getOrCreateActiveSupportSession();
      if (!isMounted) {
        return;
      }

      setActiveChatId(session.id);
      setChatSession(session);
    };

    initializeSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    const unsubscribe = subscribeToSupportSessions((sessions) => {
      const currentSession = sessions[0] ?? null;
      setChatSession(currentSession);
    }, undefined, { chatId: activeChatId });

    return unsubscribe;
  }, [activeChatId]);

  useEffect(() => {
    if (!activeChatId || chatSession !== null) {
      return;
    }

    let isMounted = true;

    const recoverDeletedSession = async () => {
      const nextSession = await createSupportSession();
      if (!isMounted) {
        return;
      }

      setActiveChatId(nextSession.id);
      setChatSession(nextSession);
      setChatInput("");
    };

    recoverDeletedSession();

    return () => {
      isMounted = false;
    };
  }, [activeChatId, chatSession]);

  useEffect(() => {
    if (!chatMessagesRef.current) {
      return;
    }

    chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
  }, [faqOpen, chatSession?.messages?.length]);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const ensureActiveSession = async () => {
    if (activeChatId) {
      return activeChatId;
    }

    const session = await getOrCreateActiveSupportSession();
    setActiveChatId(session.id);
    setChatSession(session);
    return session.id;
  };

  const handleSendQuestion = async (rawQuestion) => {
    const question = String(rawQuestion ?? "").trim();
    if (!question) {
      return;
    }

    const sessionId = await ensureActiveSession();
    if (!sessionId) {
      return;
    }

    if (chatSession?.status === "closed") {
      return;
    }

    appendUserMessage(sessionId, question);

    if (chatSession?.status === "awaiting-agent" || chatSession?.status === "agent-connected") {
      return;
    }

    const botReply = getBotReply(question);
    window.setTimeout(() => {
      appendBotMessage(sessionId, botReply);
    }, 240);
  };

  const handleSubmitChatInput = async (e) => {
    e.preventDefault();
    const nextMessage = chatInput.trim();
    if (!nextMessage) {
      return;
    }

    await handleSendQuestion(nextMessage);
    setChatInput("");
  };

  const handleRequestLiveAgent = async () => {
    const sessionId = await ensureActiveSession();
    if (!sessionId) {
      return;
    }

    requestLiveAgent(sessionId);
  };

  const handleEndChat = async () => {
    if (!activeChatId) {
      return;
    }

    await endSupportSession(activeChatId);

    const nextSession = await createSupportSession();
    setActiveChatId(nextSession.id);
    setChatSession(nextSession);
    setChatInput("");
  };

  const handleStartNewChat = async () => {
    const session = await createSupportSession();
    setActiveChatId(session.id);
    setChatSession(session);
    setChatInput("");
  };

  const isChatClosed = chatSession?.status === "closed";

  const navLinks = [
    { name: "Home", page: "Home" },
    { name: "Listings", page: "Listings" },
    { name: "Properties", page: "Properties" },
    { name: "Amenities", page: "Amenities" },
    { name: "About Us", page: "AboutUs" },
  ];

  const aboutDropdownLinks = [
    { name: "Mission & Philosophy", to: createPageUrl("AboutUs") + "#mission" },
    { name: "Core Values", to: createPageUrl("AboutUs") + "#core-values" },
    { name: "Corporate Culture", to: createPageUrl("AboutUs") + "#corporate-culture" },
  ];

  const amenitiesDropdownLinks = [
    { name: "Community Amenities", to: createPageUrl("Amenities") + "#community-amenities" },
    { name: "Live the Vicmar Lifestyle", to: createPageUrl("Amenities") + "#vicmar-lifestyle" },
    { name: "Community Gallery", to: createPageUrl("Amenities") + "#community-gallery" },
  ];

  const propertiesDropdownLinks = [
    { name: "Duplex Units", to: createPageUrl("Properties") + "#duplex" },
    { name: "Triplex Units", to: createPageUrl("Properties") + "#triplex" },
    { name: "Rowhouse Units", to: createPageUrl("Properties") + "#rowhouse" },
    { name: "Vicinity Map", to: createPageUrl("VicinityMap") },
  ];

  const handleDropdownClick = (e, targetHash, pageName) => {
    // If already on the same page, scroll to section
    if (currentPageName === pageName) {
      e.preventDefault();
      const element = document.getElementById(targetHash);
      if (element) {
        const navHeight = document.querySelector("nav")?.offsetHeight ?? 80;
        const top = element.getBoundingClientRect().top + window.scrollY - navHeight - 8;
        window.scrollTo({ top, behavior: "smooth" });
      }
    }
    // Otherwise, let React Router navigate normally and the hash will be handled by the target page
  };

  return (
    <div className="min-h-screen flex flex-col">
      <style>{`
        :root {
          --primary-green: #16a34a;
          --primary-light-green: #16a34a;
          --primary-light-green-hover: #22c55e;
        }

        .nav-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          font-size: 0.875rem;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .nav-link::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 1rem;
          right: 1rem;
          height: 2px;
          background-color: #16a34a;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.3s ease;
        }

        .nav-link:hover {
          transform: translateY(-2px);
          color: #16a34a;
        }

        .nav-link:hover::after {
          transform: scaleX(1);
        }

        .nav-link.active {
          background-color: #16a34a;
          color: white;
        }

        .nav-link.active::after {
          display: none;
        }

        @keyframes pulse-border {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.7);
          }
          50% {
            box-shadow: 0 0 0 4px rgba(22, 163, 74, 0);
          }
        }

        @keyframes subtle-scale {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        @keyframes grow-once {
          0% {
            transform: scale(1);
          }
          100% {
            transform: scale(1.08);
          }
        }

        .find-property-btn {
          transition: all 0.3s ease;
        }

        .find-property-btn:hover {
          animation: grow-once 0.3s ease-out forwards;
        }
      `}</style>

      {/* Top Bar */}
      <div className="bg-[#15803d] text-white py-2 px-4 text-sm hidden md:block">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <a href="tel:+63432332050" className="flex items-center gap-2 hover:text-[#86efac] transition-colors">
              <Phone className="w-4 h-4" />
              (043) 233-2050
            </a>
            <a href="mailto:info@vicmarhomes.com" className="flex items-center gap-2 hover:text-[#86efac] transition-colors">
              <Mail className="w-4 h-4" />
              info@vicmarhomes.com
            </a>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-[#86efac] transition-colors"><Facebook className="w-4 h-4" /></a>
            <a href="#" className="hover:text-[#86efac] transition-colors"><Instagram className="w-4 h-4" /></a>
            <a href="#" className="hover:text-[#86efac] transition-colors"><Youtube className="w-4 h-4" /></a>
          </div>
        </div>
      </div>

      {/* Main Navbar */}
      <nav className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-24">
            {/* Logo */}
            <Link to={createPageUrl("Home")} className="flex items-center overflow-visible">
              <img src={vicmarLogo} alt="Vicmar Homes" className="h-16 w-auto object-contain" />
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                link.page === "AboutUs" || link.page === "Amenities" || link.page === "Properties" ? (
                  <div key={link.page} className="relative group">
                    <Link
                      to={createPageUrl(link.page)}
                      className={`nav-link ${
                        currentPageName === link.page ? "active" : "text-gray-700"
                      }`}
                    >
                      {link.name}
                      <ChevronDown className="w-4 h-4" />
                    </Link>
                    <div className="absolute left-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 ease-in-out z-50">
                      <div className="bg-white border border-gray-200 rounded-md shadow-lg min-w-[240px] transform origin-top scale-95 group-hover:scale-100 transition-transform duration-200">
                        {(link.page === "AboutUs"
                          ? aboutDropdownLinks
                          : link.page === "Amenities"
                            ? amenitiesDropdownLinks
                            : propertiesDropdownLinks).map((item, index) => {
                          const hash = item.to.split('#')[1];
                          return (
                            <Link
                              key={item.name}
                              to={item.to}
                              onClick={(e) => hash && handleDropdownClick(e, hash, link.page)}
                              className="block px-4 py-2 text-sm text-gray-700 hover:bg-green-50 hover:text-[#16a34a] hover:pl-5 first:rounded-t-md last:rounded-b-md transition-all duration-150 ease-in-out"
                              style={{ transitionDelay: `${index * 30}ms` }}
                            >
                              {item.name}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Link
                    key={link.page}
                    to={createPageUrl(link.page)}
                    className={`nav-link ${
                      currentPageName === link.page ? "active" : "text-gray-700"
                    }`}
                  >
                    {link.name}
                  </Link>
                )
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Link
                to={createPageUrl("AdminLogin")}
                className="find-property-btn border border-[#16a34a] text-[#16a34a] hover:bg-green-50 px-6 py-2.5 rounded-full text-sm font-semibold"
              >
                LOGIN
              </Link>
              <Link
                to={createPageUrl("ContactUs")}
                className="find-property-btn bg-[#16a34a] hover:bg-[#22c55e] text-white px-6 py-2.5 rounded-full text-sm font-semibold"
              >
                CONTACT US
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-md text-gray-700"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t">
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.page}
                  to={createPageUrl(link.page)}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-md text-sm font-medium transition-all ${
                    currentPageName === link.page
                      ? "bg-[#16a34a] text-white"
                      : "text-gray-700 hover:bg-green-50 hover:translate-x-1"
                  }`}
                >
                  {link.name}
                </Link>
              ))}
              <Link
                to={createPageUrl("AdminLogin")}
                onClick={() => setMobileMenuOpen(false)}
                className="find-property-btn block border border-[#16a34a] text-[#16a34a] hover:bg-green-50 px-4 py-3 rounded-md text-sm font-semibold text-center mt-4"
              >
                LOGIN
              </Link>
              <Link
                to={createPageUrl("ContactUs")}
                onClick={() => setMobileMenuOpen(false)}
                className="find-property-btn block bg-[#16a34a] hover:bg-[#22c55e] text-white px-4 py-3 rounded-md text-sm font-semibold text-center mt-4"
              >
                CONTACT US
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="relative text-white bg-[#15803d]">
        {/* Top accent line */}
        <div className="h-1 bg-gradient-to-r from-[#86efac] via-[#22c55e] to-[#86efac]" />

        {/* Main Footer Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">

            {/* Logo & About */}
            <div className="md:col-span-1">
              <img src={vicmarLogoFooter} alt="Vicmar Homes" className="h-14 w-auto" />
              <p className="mt-4 text-white/60 text-sm leading-relaxed">
                Your trusted partner in finding the perfect home. Quality living starts with Vicmar Homes.
              </p>
              <div className="flex items-center gap-3 mt-6">
                <a href="#" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <Facebook className="w-4 h-4" />
                </a>
                <a href="#" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <Instagram className="w-4 h-4" />
                </a>
                <a href="#" className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <Youtube className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider text-white mb-5">Quick Links</h4>
              <ul className="space-y-3">
                {navLinks.map((link) => (
                  <li key={link.page}>
                    <Link
                      to={createPageUrl(link.page)}
                      className="text-white/60 hover:text-[#86efac] transition-colors text-sm"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider text-white mb-5">Contact Us</h4>
              <ul className="space-y-4 text-sm">
                <li className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#86efac] flex-shrink-0 mt-0.5" />
                  <span className="text-white/60">San Jose Sico, Batangas City</span>
                </li>
                <li className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-[#86efac] flex-shrink-0" />
                  <a href="tel:+63432332050" className="text-white/60 hover:text-white transition-colors">(043) 233-2050</a>
                </li>
                <li className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-[#86efac] flex-shrink-0" />
                  <a href="mailto:info@vicmarhomes.com" className="text-white/60 hover:text-white transition-colors">info@vicmarhomes.com</a>
                </li>
              </ul>
            </div>

            {/* Newsletter */}
            <div>
              <h4 className="font-bold text-sm uppercase tracking-wider text-white mb-5">Stay Updated</h4>
              <p className="text-white/60 text-sm mb-4">Subscribe for the latest property updates.</p>
              <div className="flex border border-white/20 rounded-full">
                <input
                  type="email"
                  placeholder="Your email"
                  className="flex-1 min-w-0 px-4 py-2.5 bg-white/10 text-white placeholder-white/40 text-sm focus:outline-none rounded-l-full"
                />
                <button className="px-5 py-2.5 bg-white text-[#16a34a] hover:bg-[#f0fdf4] text-sm font-semibold transition-colors whitespace-nowrap rounded-r-full">
                  Subscribe
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-white/10 mt-14 pt-8 flex flex-col md:flex-row justify-between items-center gap-3">
            <p className="text-white/40 text-xs">
              &copy; {new Date().getFullYear()} Vicmar Homes. All rights reserved.
            </p>
            <p className="text-white/40 text-xs">
              Sustainable Living in Batangas City
            </p>
          </div>
        </div>
      </footer>

      {/* ── Floating Buttons ── */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(80px) scale(0.8); }
          to   { opacity: 1; transform: translateX(0)   scale(1); }
        }
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes faqPanelIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .float-btn {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .float-btn:hover {
          transform: translateY(-3px) scale(1.08);
          box-shadow: 0 12px 28px rgba(22,101,52,0.35);
        }
        .float-btn:active {
          transform: scale(0.95);
        }
        .faq-item-answer {
          overflow: hidden;
          transition: max-height 0.35s ease, opacity 0.3s ease;
        }

        .chat-scrollbar::-webkit-scrollbar {
          width: 7px;
        }

        .chat-scrollbar::-webkit-scrollbar-thumb {
          background: #bbf7d0;
          border-radius: 9999px;
        }
      `}</style>

      {/* FAQ floating panel */}
      {faqOpen && (
        <div
          className="fixed inset-0 z-[60] pointer-events-none"
          style={{ animation: "fadeIn 0.2s ease" }}
        >
          <div
            ref={faqPanelRef}
            className="pointer-events-auto absolute bottom-28 right-6 w-[340px] sm:w-[410px] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
            style={{ animation: "faqPanelIn 0.3s cubic-bezier(0.34,1.56,0.64,1)" }}
          >
            {/* Panel header */}
            <div className="bg-[#15803d] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-[#86efac]" />
                <span className="text-white font-bold text-base tracking-wide">FAQ Chat</span>
              </div>
              <button
                onClick={() => setFaqOpen(false)}
                className="text-white/60 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pt-3 pb-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Quick questions:</p>
              <div className="flex flex-wrap gap-2">
                {FAQ_ITEMS.map((item) => (
                  <button
                    key={item.question}
                    type="button"
                    onClick={() => handleSendQuestion(item.question)}
                    disabled={isChatClosed}
                    className="text-xs px-3 py-1.5 rounded-full border border-green-200 bg-green-50 text-[#15803d] hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {item.question}
                  </button>
                ))}
              </div>
            </div>

            <div ref={chatMessagesRef} className="chat-scrollbar max-h-[290px] min-h-[220px] overflow-y-auto px-4 py-3 space-y-2 bg-[#f8faf8]">
              {(chatSession?.messages ?? []).map((message) => {
                const isUser = message.sender === "user";
                const isAdmin = message.sender === "admin";
                const isSystem = message.sender === "system";

                return (
                  <div
                    key={message.id}
                    className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                        isUser
                          ? "bg-[#15803d] text-white"
                          : isAdmin
                            ? "bg-white border border-blue-100 text-slate-700"
                            : isSystem
                              ? "bg-amber-50 border border-amber-200 text-amber-700"
                              : "bg-white border border-gray-100 text-gray-700"
                      }`}
                    >
                      {isAdmin ? <p className="text-[10px] font-semibold text-blue-600 mb-1">Live agent</p> : null}
                      <p>{message.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-gray-100 bg-white space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {chatSession?.status === "closed"
                    ? "Chat ended"
                    : chatSession?.status === "agent-connected"
                    ? "Live agent connected"
                    : chatSession?.status === "awaiting-agent"
                      ? "Waiting for live agent"
                      : "Chatting with FAQ assistant"}
                </span>
                <div className="flex items-center gap-2">
                  {isChatClosed ? (
                    <button
                      type="button"
                      onClick={handleStartNewChat}
                      className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                    >
                      Start new chat
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleRequestLiveAgent}
                        disabled={chatSession?.liveAgentRequested}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-55 disabled:cursor-not-allowed"
                      >
                        {chatSession?.liveAgentRequested ? "Live agent requested" : "Request live agent"}
                      </button>
                      <button
                        type="button"
                        onClick={handleEndChat}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                      >
                        End chat
                      </button>
                    </>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmitChatInput} className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isChatClosed}
                  placeholder="Type your question"
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                  type="submit"
                  disabled={isChatClosed}
                  className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-[#16a34a] text-white hover:bg-[#15803d] transition-colors disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  <SendHorizontal className="w-4 h-4" />
                </button>
              </form>

              <p className="text-[11px] text-gray-400 text-center">Need direct help? <Link to={createPageUrl("ContactUs")} onClick={() => setFaqOpen(false)} className="text-[#16a34a] font-semibold hover:underline">Contact us</Link></p>
            </div>
          </div>
        </div>
      )}

      {/* Bottom-right floating stack */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
        {/* Scroll to top */}
        <button
          onClick={scrollToTop}
          aria-label="Scroll to top"
          className="float-btn w-12 h-12 rounded-full bg-white border-2 border-[#16a34a] text-[#16a34a] flex items-center justify-center shadow-lg"
          style={{
            animation: showScrollTop ? "slideInRight 0.35s cubic-bezier(0.34,1.56,0.64,1) both" : undefined,
            opacity: showScrollTop ? 1 : 0,
            pointerEvents: showScrollTop ? "auto" : "none",
            transition: "opacity 0.25s ease",
          }}
        >
          <ChevronUp className="w-5 h-5" />
        </button>

        {/* FAQ button */}
        <button
          ref={faqBtnRef}
          onClick={() => { setFaqOpen((v) => !v); }}
          aria-label="Toggle FAQ chat"
          className={`float-btn w-14 h-14 rounded-full flex items-center justify-center shadow-xl text-white ${
            faqOpen ? "bg-[#22c55e]" : "bg-[#16a34a]"
          }`}
          style={{ animation: "slideInRight 0.4s cubic-bezier(0.34,1.56,0.64,1) both" }}
        >
          <HelpCircle className="w-7 h-7" />
        </button>
      </div>
    </div>
  );
}
