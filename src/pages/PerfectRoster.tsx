import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../firebase/auth';
import type { PerfectRosterChallenge, UserData } from '../types';
import { Trophy, Clock, ChevronRight, Trash2 } from 'lucide-react';
import { User } from 'firebase/auth';
import AdminPanel from '../components/AdminPanel';
import { useNavigate } from 'react-router-dom';

const formatPacificTime = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) + ' PT';
};

const PerfectRoster = () => {
  const [challenges, setChallenges] = useState<PerfectRosterChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = useAuth((user) => {
      setCurrentUser(user as User);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    // Set up real-time listener for challenges
    const unsubscribe = onSnapshot(
      collection(db, 'perfectRosterChallenges'),
      async (snapshot: any) => {
        const challengesData = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data()
        })) as PerfectRosterChallenge[];

        // Update challenge statuses based on dates
        const now = new Date().toISOString();
        const updatedChallenges = challengesData.map(challenge => {
          if (challenge.status === 'completed') return challenge;
          
          let newStatus: 'upcoming' | 'active' | 'completed';
          if (now < challenge.startDate) {
            newStatus = 'upcoming';
          } else if (now >= challenge.startDate && now <= challenge.endDate) {
            newStatus = 'active';
          } else {
            newStatus = 'completed';
          }

          return { ...challenge, status: newStatus };
        });

        setChallenges(updatedChallenges);
        setLoading(false);
      },
      (error: Error) => {
        setError('Failed to load challenges: ' + error.message);
        setLoading(false);
      }
    );

    // Cleanup listener on unmount
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data() as UserData;
        setIsAdmin(userData?.admin === true);
      } catch (err) {
        console.error('Failed to check admin status:', err);
      }
    };

    checkAdminStatus();
  }, [currentUser]);

  const handleDeleteChallenge = async (challengeId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation when clicking delete
    
    if (!window.confirm('Are you sure you want to delete this challenge? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'perfectRosterChallenges', challengeId));
    } catch (err) {
      setError('Failed to delete challenge');
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!currentUser) return <div>Please log in to participate in challenges</div>;

  const renderChallengeCards = () => {
    const activeAndUpcoming = challenges.filter(c => c.status !== 'completed');
    
    if (activeAndUpcoming.length === 0) {
      return (
        <div className="alert alert-warning">
          No active or upcoming challenges at this time
        </div>
      );
    }

    return (
      <div className="row g-4">
        {activeAndUpcoming.map(challenge => {
          const isActive = challenge.status === 'active';
          const userEntry = challenge.entries[currentUser?.uid || ''];
          const participantCount = Object.keys(challenge.entries).length;

          const getSlotDescription = () => {
            const parts = [];
            if (challenge.settings.captainSlots > 0) {
              parts.push(`Most Popular ${challenge.settings.captainSlots === 1 ? 'Captain' : 'Captains'}`);
            }
            if (challenge.settings.naSlots > 0) {
              parts.push(`${challenge.settings.naSlots === 1 ? 'NA Player' : 'NA Players'}`);
            }
            if (challenge.settings.brLatamSlots > 0) {
              parts.push(`${challenge.settings.brLatamSlots === 1 ? 'BR/LATAM Player' : 'BR/LATAM Players'}`);
            }
            if (challenge.settings.flexSlots > 0) {
              parts.push(`${challenge.settings.flexSlots === 1 ? 'Flex Player' : 'Flex Players'}`);
            }
            return parts.join(', ');
          };

          return (
            <div key={challenge.id} className="col-12">
              <div 
                className="card h-100"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/perfect-roster/${challenge.id}`)}
              >
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h5 className="card-title mb-1">{challenge.name}</h5>
                      <p className="text-muted mb-2">
                        {challenge.season} • {getSlotDescription()}
                      </p>
                    </div>
                    <div className="d-flex align-items-center">
                      {isAdmin && (
                        <button
                          className="btn btn-outline-danger btn-sm me-2"
                          onClick={(e) => handleDeleteChallenge(challenge.id, e)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <ChevronRight className="text-muted" />
                    </div>
                  </div>
                  
                  <div className="row g-3">
                    <div className="col-md-4">
                      <div className="d-flex align-items-center">
                        <Trophy className="text-primary me-2" size={20} />
                        <div>
                          <small className="text-muted d-block">Participants</small>
                          <strong>{participantCount}</strong>
                        </div>
                      </div>
                    </div>
                    
                    <div className="col-md-4">
                      <div className="d-flex align-items-center">
                        <Clock className="text-primary me-2" size={20} />
                        <div>
                          <small className="text-muted d-block">
                            Roster Lock
                          </small>
                          <strong>
                            {formatPacificTime(challenge.endDate)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="col-md-4">
                      <div className={`badge ${
                        isActive 
                          ? 'bg-success'
                          : 'bg-warning text-dark'
                      } p-2`}>
                        {isActive ? 'Active' : 'Coming Soon'}
                      </div>
                      {userEntry && (
                        <div className="badge bg-info ms-2 p-2">
                          Entered
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 mb-0">Perfect Roster Challenge</h1>
        {isAdmin && (
          <button 
            className="btn btn-primary"
            onClick={() => setShowAdminPanel(true)}
          >
            Admin Panel
          </button>
        )}
      </div>

      {showAdminPanel && isAdmin && (
        <div className="mb-4">
          <AdminPanel onClose={() => setShowAdminPanel(false)} />
        </div>
      )}

      {/* Challenge Cards */}
      {renderChallengeCards()}
    </div>
  );
};

export default PerfectRoster; 