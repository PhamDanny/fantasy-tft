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
import { MessageCircle, Send } from "lucide-react";
import type { League, Transaction, Team, Player } from "../../types";

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string | { toDate: () => Date };
  type: "message" | "transaction" | "system";
  metadata?: any;
}

interface LeagueChatProps {
  league: League;
  userId: string;
  userName: string;
  teams: Record<string, Team>;
  players: Record<string, Player>;
}

const formatTimestamp = (timestamp: any): string => {
  if (!timestamp) return "";

  // Handle Firestore Timestamp objects
  if (timestamp?.toDate) {
    return timestamp.toDate().toLocaleString();
  }

  // Handle ISO strings
  try {
    return new Date(timestamp).toLocaleString();
  } catch (e) {
    console.warn("Invalid timestamp:", timestamp);
    return "";
  }
};

const LeagueChat = ({
  league,
  userId,
  userName,
  teams,
  players,
}: LeagueChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

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
      for (const team of Object.values(teams)) {
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
    };

    fetchDisplayNames();
  }, [teams, userId, userName]);

  // Subscribe to chat messages and merge with transactions
  useEffect(() => {
    const chatRef = collection(db, "leagues", league.id.toString(), "chat");
    const q = query(chatRef, orderBy("timestamp", "asc"), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Get regular chat messages
      const chatMessages: ChatMessage[] = snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
          } as ChatMessage)
      );

      // Convert transactions to chat message format
      const transactionMessages: ChatMessage[] = (
        league.transactions || []
      ).map((transaction) => ({
        id: transaction.id,
        userId: "system",
        userName: "System",
        content: "",
        timestamp: transaction.timestamp,
        type: "transaction",
        metadata: transaction,
      }));

      // Combine and sort all messages by timestamp in ascending order
      const allMessages = [...chatMessages, ...transactionMessages].sort(
        (a, b) => {
          const timeA =
            typeof a.timestamp === "object" && "toDate" in a.timestamp
              ? a.timestamp.toDate()
              : new Date(a.timestamp);
          const timeB =
            typeof b.timestamp === "object" && "toDate" in b.timestamp
              ? b.timestamp.toDate()
              : new Date(b.timestamp);
          return timeA.getTime() - timeB.getTime();
        }
      );

      setMessages(allMessages);
    });

    return () => unsubscribe();
  }, [league.id, league.transactions]);

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
    const timestamp = formatTimestamp(message.timestamp);

    // Find team name from league data
    const team = Object.values(teams).find(
      (team) =>
        team.ownerID === message.userId ||
        team.coOwners?.includes(message.userId)
    );
    const displayName = team ? team.teamName : "Unknown Team";

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
        const getTeamName = (teamId: string) =>
          teams[teamId]?.teamName || "Unknown Team";
        const getPlayerNames = (playerIds: string[]) =>
          playerIds.map((id) => players[id]?.name || "Unknown Player");

        let content = null;
        switch (metadata.type) {
          case "trade":
            content = (
              <div>
                <div className="h5 mb-2 text-center">Trade Completed</div>
                <div className="d-flex justify-content-between align-items-start gap-5">
                  {metadata.teamIds.map((teamId) => (
                    <div key={teamId} className="flex-grow-1 text-center">
                      <div className="h6 mb-2">
                        {getTeamName(teamId)} receives
                      </div>
                      <div className="text-success">
                        {getPlayerNames(metadata.adds[teamId] || []).map(
                          (name, i) => (
                            <div key={i}>{name}</div>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
            break;

          case "waiver":
            const team = getTeamName(metadata.teamIds[0]);
            const addedPlayers = getPlayerNames(
              metadata.adds[metadata.teamIds[0]] || []
            );
            const droppedPlayers =
              metadata.drops[metadata.teamIds[0]]?.length > 0
                ? getPlayerNames(metadata.drops[metadata.teamIds[0]])
                : [];
            const faabSpent =
              metadata.metadata.faabSpent?.[metadata.teamIds[0]] || 0;

            content = (
              <div>
                <div className="text-muted mb-1">Waiver claim by {team}</div>
                <div className="d-flex justify-content-between align-items-start gap-4">
                  <div className="flex-grow-1">
                    <div className="text-success">
                      + Added:{" "}
                      {addedPlayers.map((name, i) => (
                        <div key={i} className="ms-2">
                          {name}
                        </div>
                      ))}
                    </div>
                    {droppedPlayers.length > 0 && (
                      <div className="text-danger">
                        - Dropped:{" "}
                        {droppedPlayers.map((name, i) => (
                          <div key={i} className="ms-2">
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-muted">FAAB: ${faabSpent}</div>
                </div>
              </div>
            );
            break;

          case "free_agent":
            const faTeam = getTeamName(metadata.teamIds[0]);
            const faPlayers = getPlayerNames(
              metadata.adds[metadata.teamIds[0]] || []
            );
            const faDrops =
              metadata.drops[metadata.teamIds[0]]?.length > 0
                ? getPlayerNames(metadata.drops[metadata.teamIds[0]])
                : [];

            content = (
              <div>
                <div className="text-muted mb-1">
                  Free agent pickup by {faTeam}
                </div>
                <div className="d-flex justify-content-between align-items-start gap-4">
                  <div className="flex-grow-1">
                    <div className="text-success">
                      + Added:{" "}
                      {faPlayers.map((name, i) => (
                        <div key={i} className="ms-2">
                          {name}
                        </div>
                      ))}
                    </div>
                    {faDrops.length > 0 && (
                      <div className="text-danger">
                        - Dropped:{" "}
                        {faDrops.map((name, i) => (
                          <div key={i} className="ms-2">
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            break;
        }

        return (
          <div className="d-flex justify-content-center mb-3">
            <div
              className={`bg-light px-4 py-3 rounded-3 ${
                message.metadata?.type === "trade" ? "w-100" : "w-75"
              }`}
            >
              {content}
              <div className="text-muted small text-center mt-2">
                {timestamp}
              </div>
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
