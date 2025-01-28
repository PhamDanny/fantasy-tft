import React, { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { format } from "date-fns";
import { MessageCircle, Send } from "lucide-react";
import type { League, Transaction } from "../../types";

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  type: "message" | "transaction" | "system";
  metadata?: any;
}

interface LeagueChatProps {
  league: League;
  userId: string;
  userName: string;
}

const LeagueChat = ({ league, userId, userName }: LeagueChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [userDisplayNames, setUserDisplayNames] = useState<
    Record<string, string>
  >({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch display names for all team owners
  useEffect(() => {
    const fetchDisplayNames = async () => {
      const names: Record<string, string> = {};
      // Start with current user
      names[userId] = userName;

      // Fetch for all other team owners
      for (const team of Object.values(league.teams)) {
        if (team.ownerID !== userId) {
          // Skip current user
          try {
            const userDoc = await getDoc(doc(db, "users", team.ownerID));
            if (userDoc.exists()) {
              names[team.ownerID] = userDoc.data().displayName;
            }
          } catch (error) {
            console.error("Error fetching display name:", error);
          }
        }
      }
      setUserDisplayNames(names);
    };

    fetchDisplayNames();
  }, [league.teams, userId, userName]);

  // Subscribe to chat messages
  useEffect(() => {
    const chatRef = collection(db, "leagues", league.id.toString(), "chat");
    const q = query(chatRef, orderBy("timestamp", "desc"), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        newMessages.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setMessages(newMessages.reverse());
    });

    return () => unsubscribe();
  }, [league.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setLoading(true);
    try {
      // Get user's display name from Firestore
      const userDoc = await getDoc(doc(db, "users", userId));
      const userDisplayName = userDoc.exists()
        ? userDoc.data().displayName
        : "Anonymous";

      const chatRef = collection(db, "leagues", league.id.toString(), "chat");
      await addDoc(chatRef, {
        userId,
        userName: userDisplayName, // Use name from Firestore
        content: newMessage.trim(),
        timestamp: new Date().toISOString(),
        type: "message",
      });
      setNewMessage("");
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (message: ChatMessage) => {
    const isOwnMessage = message.userId === userId;
    const timestamp = format(new Date(message.timestamp), "MMM d, h:mm a");

    // Find team name from league data
    const senderTeam = Object.values(league.teams).find(
      (team) => team.ownerID === message.userId
    );
    const displayName = senderTeam ? senderTeam.teamName : "Unknown Team";

    switch (message.type) {
      case "message":
        return (
          <div
            className={`d-flex mb-2 ${
              isOwnMessage ? "justify-content-end" : "justify-content-start"
            }`}
          >
            <div
              className={`px-3 py-2 rounded-3 ${
                isOwnMessage ? "bg-primary text-white" : "bg-light"
              }`}
              style={{ maxWidth: "75%" }}
            >
              <div
                className={`fw-medium small mb-1 ${
                  isOwnMessage ? "text-white-50" : ""
                }`}
              >
                {displayName}
              </div>
              <div className="mb-1">{message.content}</div>
              <div
                className={`small ${
                  isOwnMessage ? "text-white-50" : "text-muted"
                }`}
              >
                {timestamp}
              </div>
            </div>
          </div>
        );

      case "transaction":
        const metadata = message.metadata as Transaction;
        return (
          <div className="d-flex justify-content-center mb-2">
            <div className="text-center small text-muted bg-light px-3 py-2 rounded-3">
              <div className="mb-1">
                {metadata.type === "trade" && "Trade completed"}
                {metadata.type === "waiver" && "Waiver claim processed"}
                {metadata.type === "free_agent" && "Free agent acquired"}
                {metadata.type === "commissioner" && "Commissioner action"}
              </div>
              <div>{timestamp}</div>
            </div>
          </div>
        );

      case "system":
        return (
          <div className="d-flex justify-content-center mb-2">
            <div className="text-center small text-muted bg-light px-3 py-2 rounded-3">
              <div className="mb-1">{message.content}</div>
              <div>{timestamp}</div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="card h-100">
      <div className="card-header d-flex align-items-center gap-2">
        <MessageCircle size={18} />
        <h4 className="h6 mb-0">League Chat</h4>
      </div>

      <div
        ref={chatContainerRef}
        className="card-body p-3 overflow-y-auto"
        style={{ height: "600px" }}
      >
        {messages.map((message) => (
          <div key={message.id}>{renderMessage(message)}</div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="card-footer p-3">
        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input
              type="text"
              className="form-control"
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="btn btn-primary d-flex align-items-center gap-2"
              disabled={loading || !newMessage.trim()}
            >
              <Send size={18} />
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LeagueChat;
