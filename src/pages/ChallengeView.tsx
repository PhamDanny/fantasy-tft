import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, onSnapshot, deleteDoc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../firebase/auth';
import type { PerfectRosterChallenge, PerfectRosterLineup, Player, PlayerScores } from '../types';
import { Trash2 } from 'lucide-react';
import LineupEditor from '../components/LineupEditor';
import ChallengeLeaderboard from '../components/ChallengeLeaderboard';
import PerfectLineup from '../components/PerfectLineup';
import PopularRoster from '../components/PopularRoster';
import { useTheme } from '../contexts/ThemeContext';

const ChallengeView = () => {
  const { challengeId } = useParams();
  const [challenge, setChallenge] = useState<PerfectRosterChallenge | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'lineup' | 'leaderboard' | 'perfect' | 'popular'>(
    'leaderboard'  // Default to leaderboard
  );
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();

  // Update auth state
  useEffect(() => {
    const unsubscribe = useAuth(async (user) => {
      setCurrentUser(user);
      // Only check admin status if user is logged in
      if (user) {
        try {
          const adminDoc = await getDoc(doc(db, 'admins', 'list'));
          setIsAdmin(adminDoc.exists() && adminDoc.data().userIds.includes(user.uid));
        } catch (err) {
          console.error('Failed to check admin status:', err);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Add this helper function
  const canSubmitLineup = () => {
    return (
      currentUser && // User is logged in
      challenge && // Challenge exists
      (challenge.entries[currentUser.uid] || // Has an existing entry
       (challenge.endDate && challenge.endDate.toDate() > new Date())) // Or submissions are still open
    );
  };

  // Update active tab when user auth state changes
  useEffect(() => {
    // If user can't submit, default to leaderboard
    setActiveTab(canSubmitLineup() ? 'lineup' : 'leaderboard');
  }, [currentUser, challenge]);

  useEffect(() => {
    if (!challengeId) {
      return;
    }

    setLoading(true);

    // Set up real-time listener for the challenge
    const unsubscribe = onSnapshot(
      doc(db, 'perfectRosterChallenges', challengeId),
      async (doc) => {
        try {
          if (doc.exists()) {
            const challengeData = { id: doc.id, ...doc.data() } as PerfectRosterChallenge;
            setChallenge(challengeData);
            
            // Always fetch players when challenge data updates
            const playersRef = collection(db, 'players');
            const q = query(playersRef, where('set', '==', Number(challengeData.set)));
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
          } else {
            setError('Challenge not found');
          }
        } catch (err) {
          console.error('Error loading challenge data:', err);
          setError('Failed to load challenge data');
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error('Error in challenge snapshot:', error);
        setError('Failed to load challenge: ' + error.message);
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [challengeId]);

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

  const handleSaveLineup = async (lineup: PerfectRosterLineup) => {
    if (!challengeId) throw new Error('Challenge ID is missing');
    if (!currentUser?.uid) throw new Error('You must be logged in to save a lineup');
    if (!challenge) throw new Error('Challenge data is missing');

    try {
      setError(null); // Clear any existing errors
      const challengeRef = doc(db, 'perfectRosterChallenges', challengeId);
      
      // First, get the user's display name from Firestore
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      const userName = userDoc.exists() ? userDoc.data().displayName : "Unknown";

      const updateData = {
        entries: {
          [currentUser.uid]: {
            ...lineup,
            userId: currentUser.uid,
            userName: userName,  // Use the name from Firestore
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
      if (err instanceof Error && err.message.includes('PERMISSION_DENIED')) {
        setError('Unable to save lineup: The submission deadline has passed.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save lineup');
      }
    }
  };

  // Add helper to validate currentCup
  const validateCurrentCup = (cup: string): keyof PlayerScores => {
    if (cup === 'cup1' || cup === 'cup2' || cup === 'cup3') {
      return cup;
    }
    // Default to cup1 if invalid
    console.warn(`Invalid cup value: ${cup}, defaulting to cup1`);
    return 'cup1';
  };

  // Update isTournamentComplete to use validated currentCup
  const isTournamentComplete = () => {
    if (!challenge) return false;
    
    const validCup = validateCurrentCup(challenge.currentCup);
    
    // If any player has a score, and there's a clear top scorer (no ties for first)
    const scores = Object.values(players)
      .filter(p => p.scores?.[validCup])
      .map(p => p.scores[validCup]);
    
    return scores.length > 0 && 
           scores.filter(score => score === Math.max(...scores)).length === 1;
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!challenge) return <div>Challenge not found</div>;

  // Validate currentCup before passing to components
  const validatedCurrentCup = validateCurrentCup(challenge.currentCup);

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

      {/* Challenge Navigation - hide lineup tab when appropriate */}
      <ul className="nav nav-tabs mb-4">
        {canSubmitLineup() && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'lineup' ? 'active' : ''}`}
              onClick={() => setActiveTab('lineup')}
            >
              My Lineup
            </button>
          </li>
        )}
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

      {/* Sign up banner for logged out users */}
      {!currentUser && (
        <div className={`alert ${isDarkMode ? 'alert-dark' : 'alert-info'} mb-4 d-flex justify-content-between align-items-center`}>
          <div>
            <strong>Want to participate?</strong> Sign up to create your own lineup!
          </div>
          <a href="/login?mode=signup" className="btn btn-primary btn-sm">
            Sign Up Now
          </a>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'lineup' && currentUser && (
        <>
          {error && (
            <div className={`alert ${isDarkMode ? 'alert-dark' : 'alert-danger'} mb-4`}>
              {error}
            </div>
          )}
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
              challenge.endDate.toDate() < new Date()
            }
            set={challenge.set}
            currentCup={validatedCurrentCup}
            entries={challenge.entries}
            currentUser={currentUser}
            challenge={challenge}
          />
        </>
      )}

      {activeTab === 'leaderboard' && (
        <ChallengeLeaderboard
          entries={challenge.entries}
          players={players}
          currentCup={validatedCurrentCup}
          endDate={challenge.endDate}
          challenge={challenge}
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
          currentCup={validatedCurrentCup}
          settings={challenge.settings}
          isComplete={isTournamentComplete()}
          challenge={challenge}
        />
      )}
    </div>
  );
};

export default ChallengeView; 