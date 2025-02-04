import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, onSnapshot, deleteDoc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../firebase/auth';
import type { PerfectRosterChallenge, PerfectRosterLineup, Player } from '../types';
import { Trash2 } from 'lucide-react';
import LineupEditor from '../components/LineupEditor';
import ChallengeLeaderboard from '../components/ChallengeLeaderboard';
import PerfectLineup from '../components/PerfectLineup';
import PopularRoster from '../components/PopularRoster';

const ChallengeView = () => {
  const { challengeId } = useParams();
  const [challenge, setChallenge] = useState<PerfectRosterChallenge | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'lineup' | 'leaderboard' | 'perfect' | 'popular'>('lineup');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  // Update auth state
  useEffect(() => {
    const unsubscribe = useAuth(async (user) => {
      setCurrentUser(user);
      if (user) {
        // Check if user is admin
        const adminDoc = await getDoc(doc(db, 'admins', 'list'));
        setIsAdmin(adminDoc.exists() && adminDoc.data().userIds.includes(user.uid));
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Memoize fetchPlayers to prevent recreation on every render
  const fetchPlayers = useCallback(async (challengeSet: number) => {
    if (!challengeSet) return;

    const playersRef = collection(db, 'players');
    const q = query(playersRef, where('set', '==', Number(challengeSet)));
    
    try {
      const playersSnap = await getDocs(q);
      const playersData: Record<string, Player> = {};
      
      playersSnap.forEach(doc => {
        const data = doc.data();
        playersData[doc.id] = {
          id: doc.id,
          ...data
        } as Player;
      });
      
      setPlayers(playersData);
    } catch (err) {
      setError('Failed to load players');
    }
  }, []);

  useEffect(() => {
    if (!challengeId) return;

    // Set up real-time listener for the challenge
    const unsubscribe = onSnapshot(
      doc(db, 'perfectRosterChallenges', challengeId),
      async (doc) => {
        if (doc.exists()) {
          const challengeData = { id: doc.id, ...doc.data() } as PerfectRosterChallenge;
          setChallenge(challengeData);
          
          // Only fetch players if the set has changed
          if (challengeData.set !== challenge?.set) {
            await fetchPlayers(challengeData.set);
          }
        } else {
          setError('Challenge not found');
        }
        setLoading(false);
      },
      (error) => {
        setError('Failed to load challenge: ' + error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [challengeId, fetchPlayers, challenge?.set]);

  const handleDelete = async () => {
    if (!challengeId || !currentUser?.uid) return;
    
    if (!window.confirm('Are you sure you want to delete this challenge? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'perfectRosterChallenges', challengeId));
      navigate('/perfect-roster');
    } catch (err) {
      setError('Failed to delete challenge');
    }
  };

  const handleSaveLineup = async (newLineup: PerfectRosterLineup) => {
    if (!challengeId) throw new Error('Challenge ID is missing');
    if (!currentUser?.uid) throw new Error('You must be logged in to save a lineup');
    if (!challenge) throw new Error('Challenge data is missing');

    try {
      const challengeRef = doc(db, 'perfectRosterChallenges', challengeId);
      
      // Keep the existing userName if it exists, otherwise use current display name
      const existingEntry = challenge.entries[currentUser.uid];
      const userName = existingEntry?.userName || 
                      currentUser.displayName || 
                      `User${currentUser.uid.slice(0,4)}`;

      const updateData = {
        entries: {
          [currentUser.uid]: {
            ...newLineup,
            userId: currentUser.uid,
            userName: currentUser.displayName || userName, // Prioritize current displayName
            timestamp: serverTimestamp(),
            locked: false
          }
        }
      };

      await setDoc(
        challengeRef,
        updateData,
        { merge: true }
      );
    } catch (err) {
      throw new Error(`Failed to save lineup: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Add helper to check if tournament is complete
  const isTournamentComplete = () => {
    if (!challenge) return false;
    
    // If any player has a score, and there's a clear top scorer (no ties for first)
    const scores = Object.values(players)
      .filter(p => p.scores?.[challenge.currentCup])
      .map(p => p.scores[challenge.currentCup]);
    
    return scores.length > 0 && 
           scores.filter(score => score === Math.max(...scores)).length === 1;
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!challenge) return <div>Challenge not found</div>;
  if (!currentUser) return <div>Please log in to view challenges</div>;

  return (
    <div className="container-fluid">
      <div className="mb-4 d-flex justify-content-between align-items-center">
        <div>
          <h2 className="h4 mb-1">{challenge.name}</h2>
          <p className="text-muted mb-0">{challenge.season}</p>
        </div>
        {isAdmin && (
          <button 
            className="btn btn-outline-danger"
            onClick={handleDelete}
          >
            <Trash2 className="me-2" size={16} />
            Delete Challenge
          </button>
        )}
      </div>

      {/* Challenge Navigation */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'lineup' ? 'active' : ''}`}
            onClick={() => setActiveTab('lineup')}
          >
            My Lineup
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'leaderboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('leaderboard')}
          >
            Leaderboard
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'popular' ? 'active' : ''}`}
            onClick={() => setActiveTab('popular')}
          >
            Popular Roster
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'perfect' ? 'active' : ''}`}
            onClick={() => setActiveTab('perfect')}
          >
            Perfect Roster
          </button>
        </li>
      </ul>

      {/* Tab Content */}
      {activeTab === 'lineup' && (
        <LineupEditor
          players={players}
          lineup={
            challenge.entries[currentUser.uid] || {
              captains: Array(challenge.settings.captainSlots).fill(null),
              naSlots: Array(challenge.settings.naSlots).fill(null),
              brLatamSlots: Array(challenge.settings.brLatamSlots).fill(null),
              flexSlots: Array(challenge.settings.flexSlots).fill(null),
              locked: false,
              userId: currentUser.uid,
              userName: currentUser.displayName || `User${currentUser.uid.slice(0,4)}`,
              timestamp: new Date().toISOString()
            }
          }
          onSave={handleSaveLineup}
          isLocked={
            challenge.entries[currentUser.uid]?.locked ||
            new Date().toISOString() > challenge.endDate
          }
          set={challenge.set}
        />
      )}

      {activeTab === 'leaderboard' && (
        <ChallengeLeaderboard
          entries={challenge.entries}
          players={players}
          currentCup={challenge.currentCup}
        />
      )}

      {activeTab === 'popular' && (
        <PopularRoster
          entries={challenge.entries}
          players={players}
          settings={challenge.settings}
        />
      )}

      {activeTab === 'perfect' && challenge && (
        <PerfectLineup
          players={players}
          currentCup={challenge.currentCup}
          settings={challenge.settings}
          isComplete={isTournamentComplete()}
        />
      )}
    </div>
  );
};

export default ChallengeView; 